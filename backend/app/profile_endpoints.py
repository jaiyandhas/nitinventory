import asyncio
import time
import json
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import FastAPI, Request
from fastapi.routing import APIRoute
from httpx import AsyncClient

# Import app modules
from app.main import app
from app.core.database import engine, AsyncSessionLocal
from app.models.budget import BudgetMaster, FinancialYear
from app.models.purchase_request import PurchaseRequest, PurchaseRequestItem, PurchaseRequestFlow, RequestStatus
from app.models.asset import Asset
from app.models.user import User

# Timing and query tracking globals
sql_query_count = 0
sql_total_time = 0.0

@event.listens_for(engine.sync_engine, "before_cursor_execute")
def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    context._query_start_time = time.perf_counter()

@event.listens_for(engine.sync_engine, "after_cursor_execute")
def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    elapsed = time.perf_counter() - context._query_start_time
    global sql_query_count, sql_total_time
    sql_query_count += 1
    sql_total_time += elapsed

# Instrument FastAPI APIRoute to trace service execution and serialization times via ASGI wrapping
last_profile_data = None

async def make_wrapped_handle(r: APIRoute, orig_handle):
    async def wrapped_handle(scope, receive, send):
        global sql_query_count, sql_total_time, last_profile_data
        
        # Reset counters
        start_queries = sql_query_count
        start_sql_time = sql_total_time
        
        # Wrap endpoint to capture service time
        original_endpoint = r.dependant.call
        endpoint_time = 0.0
        
        async def wrapped_endpoint(*args, **kwargs):
            nonlocal endpoint_time
            t0 = time.perf_counter()
            if asyncio.iscoroutinefunction(original_endpoint):
                res = await original_endpoint(*args, **kwargs)
            else:
                res = original_endpoint(*args, **kwargs)
            endpoint_time = time.perf_counter() - t0
            return res
            
        r.dependant.call = wrapped_endpoint
        
        t_start = time.perf_counter()
        response_size = 0
        
        async def wrapped_send(message):
            nonlocal response_size
            if message["type"] == "http.response.body":
                response_size += len(message.get("body", b""))
            await send(message)
            
        await orig_handle(scope, receive, wrapped_send)
        
        total_time = time.perf_counter() - t_start
        queries_run = sql_query_count - start_queries
        db_time = sql_total_time - start_sql_time
        serialization_time = max(0.0, total_time - endpoint_time)
        
        last_profile_data = {
            "total_time": total_time,
            "service_time": endpoint_time,
            "serialization_time": serialization_time,
            "query_count": queries_run,
            "db_time": db_time,
            "path": r.path,
            "response_size": response_size
        }
        
    return wrapped_handle

# Apply wrapping to all APIRoutes
async def setup_wrappers():
    for route in app.routes:
        if isinstance(route, APIRoute):
            orig_handle = route.handle
            route.handle = await make_wrapped_handle(route, orig_handle)

# PR Creation Step-by-Step timings intercept
pr_creation_timings = {}
from app.services.budget_service import BudgetService
from app.services.flow_engine import FlowEngineService
from app.services.document_service import DocumentService

# Hook lock_amount
original_lock_amount = BudgetService.lock_amount
async def timed_lock_amount(self, pr):
    t0 = time.perf_counter()
    res = await original_lock_amount(self, pr)
    pr_creation_timings["budget_locking"] = (time.perf_counter() - t0) * 1000
    return res
BudgetService.lock_amount = timed_lock_amount

# Hook initialize flow
original_flow_init = FlowEngineService.initialize
async def timed_flow_init(self, pr, initiator):
    t0 = time.perf_counter()
    res = await original_flow_init(self, pr, initiator)
    pr_creation_timings["workflow_resolution"] = (time.perf_counter() - t0) * 1000 - pr_creation_timings.get("budget_locking", 0)
    return res
FlowEngineService.initialize = timed_flow_init

# Hook document service
original_save_upload = DocumentService.save_upload
async def timed_save_upload(self, pr, doc_key, upload_file, user_id):
    t0 = time.perf_counter()
    res = await original_save_upload(self, pr, doc_key, upload_file, user_id)
    pr_creation_timings["document_creation"] = pr_creation_timings.get("document_creation", 0.0) + (time.perf_counter() - t0) * 1000
    return res
DocumentService.save_upload = timed_save_upload

# Hook db commit
original_commit = AsyncSession.commit
async def timed_commit(self):
    t0 = time.perf_counter()
    res = await original_commit(self)
    pr_creation_timings["database_commit"] = (time.perf_counter() - t0) * 1000
    return res
AsyncSession.commit = timed_commit

async def run_profiles():
    global last_profile_data
    
    await setup_wrappers()
    
    # Instantiate clients
    client_faculty = AsyncClient(app=app, base_url="http://test")
    client_admin = AsyncClient(app=app, base_url="http://test")
    client_sp = AsyncClient(app=app, base_url="http://test")
    client_da = AsyncClient(app=app, base_url="http://test")
    
    # 1. Login Endpoint
    login_payload = {"email": "faculty.cse@nitt.edu", "password": "password"}
    login_resp = await client_faculty.post("/api/auth/login", json=login_payload)
    login_stats = last_profile_data
    
    # 2. Dashboard Endpoint
    await client_faculty.get("/api/budget/overview")
    dashboard_stats = last_profile_data
    
    # Get budget files to find a valid budget_id
    files_resp = await client_faculty.get("/api/budget/files")
    budget_files = files_resp.json()
    
    # Select the first budget with sufficient balance (e.g. ID 9)
    budget_id = 9
    for b in budget_files:
        if b.get("available_balance", 0) >= 80000.0:
            budget_id = b["id"]
            break
    
    # 3. Create Purchase Request (Deep Dive & Endpoint Timing)
    pr_payload = {
        "selected_file_ids": [budget_id],
        "mop": 1, # GeM
        "nominee_id": None,
        "basis_of_estimate": "Market survey and vendor quotations",
        "emd": 2.0,
        "performance_security": 3.0,
        "is_service_center_south": False,
        "delivery_location": "CSE Department, NIT Tiruchirappalli",
        "delivery_mode": "Door delivery",
        "is_quantity_split": False,
        "is_item_split": False,
        "exemption": False,
        "training_required": False,
        "purchase_type": "department",
        "form_data": {"gem_link": "https://gem.gov.in/bid/GEM/2026/B/1001"},
        "items": [
            {
                "budget_file_id": budget_id,
                "quantity": 1,
                "requirement_type": "Research",
                "warranty": 1.0,
                "delivery_period": 1.0,
                "installation_required": False,
                "site_readiness": True,
                "availability": "No",
                "tech_specs_text": "Standard specifications compliant with GFR 2017."
            }
        ]
    }
    
    # Run creation
    pr_creation_timings.clear()
    t_start_create = time.perf_counter()
    create_resp = await client_faculty.post("/api/pr/", json=pr_payload)
    total_create_time = (time.perf_counter() - t_start_create) * 1000
    create_stats = last_profile_data
    
    if create_resp.status_code != 200:
        print("PR creation failed with status:", create_resp.status_code)
        print("Response body:", create_resp.text)
        pr_id = None
    else:
        pr_id = create_resp.json().get("id")
    
    # 4. PR Detail Page
    if pr_id:
        await client_faculty.get(f"/api/pr/{pr_id}")
        pr_detail_stats = last_profile_data
    else:
        # Fallback to seeded PR 1
        await client_faculty.get("/api/pr/1")
        pr_detail_stats = last_profile_data
        pr_id = 1
    
    # 5. Purchase Request List
    await client_faculty.get("/api/pr/")
    pr_list_stats = last_profile_data
    
    # 6. Budget List
    # Needs Admin login
    await client_admin.post("/api/auth/login", json={"email": "admin@nitt.edu", "password": "password"})
    await client_admin.get("/api/admin/budget")
    budget_list_stats = last_profile_data
    
    # 7. Asset List
    await client_admin.get("/api/assets/")
    asset_list_stats = last_profile_data
    
    # 8. Asset Detail
    assets_resp = await client_admin.get("/api/assets/")
    assets = assets_resp.json().get("items", [])
    asset_id = assets[0]["id"] if assets else 1
    await client_admin.get(f"/api/assets/{asset_id}")
    asset_detail_stats = last_profile_data
    
    # 9. Workflow Actions
    # Advance PR 2 using HOD login
    await client_sp.post("/api/auth/login", json={"email": "hod.cse@nitt.edu", "password": "password"})
    adv_resp = await client_sp.post("/api/pr/2/advance", json={"remarks": "HOD recommendation", "status": "Approved"})
    if adv_resp.status_code != 200:
        print("Workflow action failed with status:", adv_resp.status_code)
        print("Response body:", adv_resp.text)
    workflow_action_stats = last_profile_data
    
    # 10. Document Upload
    # DA uploads tender details on PR 3 (which is at tendering step 2)
    await client_da.post("/api/auth/login", json={"email": "da.stores@nitt.edu", "password": "password"})
    
    # Prepare dummy file upload for tender-details (with %PDF signature bytes)
    files = {
        "draft_tender_document": ("draft.pdf", b"%PDF-1.4\n%Dummy draft pdf content", "application/pdf"),
        "tender_document": ("tender.pdf", b"%PDF-1.4\n%Dummy tender pdf content", "application/pdf")
    }
    payload_data = {
        "tender_reference_number": "TND-100",
        "date_of_tender": "2026-06-05",
        "date_of_tech_bid_opening": "2026-06-15",
        "date_of_financial_bid_opening": "2026-06-20",
        "vendors": [{"name": "Vendor A", "email": "vendora@test.com", "quoted_amount": 10000.0, "is_qualified": True}]
    }
    
    # Call using client_da
    doc_resp = await client_da.post(
        "/api/pr/3/tender-details",
        data={"payload": json.dumps(payload_data)},
        files=files
    )
    if doc_resp.status_code != 200:
        print("Document upload failed with status:", doc_resp.status_code)
        print("Response body:", doc_resp.text)
    doc_upload_stats = last_profile_data
    
    # Compile report
    report = {
        "login": login_stats,
        "dashboard": dashboard_stats,
        "create_pr": create_stats,
        "pr_detail": pr_detail_stats,
        "pr_list": pr_list_stats,
        "budget_list": budget_list_stats,
        "asset_list": asset_list_stats,
        "asset_detail": asset_detail_stats,
        "workflow_actions": workflow_action_stats,
        "document_upload": doc_upload_stats,
        "pr_creation_deep_dive": {
            "total_ms": total_create_time,
            "timings_ms": pr_creation_timings,
            "serialization_ms": (create_stats["serialization_time"] * 1000) if create_stats else 0,
            "service_ms": (create_stats["service_time"] * 1000) if create_stats else 0,
        }
    }
    
    print("PROFILING_RESULTS_JSON_START")
    print(json.dumps(report, indent=2))
    print("PROFILING_RESULTS_JSON_END")

if __name__ == "__main__":
    asyncio.run(run_profiles())
