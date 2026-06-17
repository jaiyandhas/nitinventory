import pytest
from datetime import date
from fastapi import HTTPException
from sqlalchemy import select
from app.models.user import User
from app.models.budget import BudgetMaster, FinancialYear
from app.models.purchase_request import PurchaseRequest, PurchaseOrder
from app.models.inventory import Delivery, StoresAssetLog, DeliveryItem
from app.models.asset import Asset, InstallationRecord
from app.schemas.pr_create import PRCreatePayload, PRItemCreate
from app.schemas.purchase_order import PurchaseOrderCreate
from app.routers.purchase_requests import _persist_pr, create_purchase_order, get_purchase_order
from app.routers.assets import record_installation, get_installation_records
from app.services.grn_service import GrnService

@pytest.mark.asyncio
async def test_procurement_enhancements_workflow(db_session):
    db_session.commit = db_session.flush

    # Fetch CSE HOD and Faculty
    hod = (await db_session.execute(select(User).where(User.email == "hod.cse@nitt.edu"))).scalar_one()
    faculty = (await db_session.execute(select(User).where(User.email == "faculty.cse@nitt.edu"))).scalar_one()
    await db_session.refresh(hod, ["department", "role"])
    await db_session.refresh(faculty, ["department", "role"])

    # Fetch active financial year
    fy = (await db_session.execute(select(FinancialYear).where(FinancialYear.is_active == True).limit(1))).scalar_one()

    # Create matching CAPEX budgets (to test balance validation)
    budget_ok = BudgetMaster(
        department_id=hod.department_id,
        financial_year_id=fy.id,
        source_of_fund="PMRF",
        item_name="PMRF Item OK",
        category="equipment",
        course_code="N/A",
        unit_cost=100.0,
        quantity=5,
        total_allocation=1000.0,
        file_no="TEST-PMRF-OK",
        is_revision=False,
        allocated_initiator_id=faculty.id
    )
    
    # Budget with low allocation
    budget_low = BudgetMaster(
        department_id=hod.department_id,
        financial_year_id=fy.id,
        source_of_fund="PMRF",
        item_name="PMRF Item Low",
        category="equipment",
        course_code="N/A",
        unit_cost=500.0,
        quantity=5,
        total_allocation=2500.0,
        committed_amount=2400.0, # only 100 available balance
        file_no="TEST-PMRF-LOW",
        is_revision=False,
        allocated_initiator_id=faculty.id
    )

    db_session.add(budget_ok)
    db_session.add(budget_low)
    await db_session.flush()

    # Fetch a procurement method and temporarily mock its schema to None to bypass schema validations
    from app.models.budget import ProcurementManager
    procurement = (await db_session.execute(select(ProcurementManager).where(ProcurementManager.id == 1))).scalar_one()
    original_schema = procurement.form_schema
    procurement.form_schema = None
    await db_session.flush()

    try:
        # Create item schemas
        item_ok = PRItemCreate(
            budget_file_id=budget_ok.id,
            quantity=5,
            charges=0.0,
            requirement_type="Research",
            warranty=12.0,
            delivery_period=4.0,
            installation_required=False,
            site_readiness=True,
            availability="No",
            tech_specs_text="Specs OK",
        )
        
        item_low = PRItemCreate(
            budget_file_id=budget_low.id,
            quantity=5,
            charges=0.0,
            requirement_type="Research",
            warranty=12.0,
            delivery_period=4.0,
            installation_required=False,
            site_readiness=True,
            availability="No",
            tech_specs_text="Specs Low",
        )

        # Test Case 1: Fund balance validation (should raise 422 because item_low totals 2500, but available is only 100)
        payload_low = PRCreatePayload(
            selected_file_ids=[budget_low.id],
            mop=1,
            nominee_id=None,
            basis_of_estimate="Budgetary Quote",
            emd=0.0,
            performance_security=0.0,
            delivery_location="CSE Dept",
            delivery_mode="Courier",
            items=[item_low],
            initiator_id=faculty.id,
        )
        
        with pytest.raises(HTTPException) as exc_info:
            await _persist_pr(payload_low, faculty, db_session, None)
        assert exc_info.value.status_code == 422
        assert "exceeds available budget" in exc_info.value.detail

        # Test Case 2: Successful PR creation
        payload_ok = PRCreatePayload(
            selected_file_ids=[budget_ok.id],
            mop=1,
            nominee_id=None,
            basis_of_estimate="Budgetary Quote",
            emd=0.0,
            performance_security=0.0,
            delivery_location="CSE Dept",
            delivery_mode="Courier",
            items=[item_ok],
            initiator_id=faculty.id,
        )
        res_pr = await _persist_pr(payload_ok, faculty, db_session, None)
        assert res_pr is not None
        pr_id = res_pr["id"]
    finally:
        # Restore original schema
        procurement.form_schema = original_schema
        await db_session.flush()

    # Retrieve created PR
    pr = (await db_session.execute(select(PurchaseRequest).where(PurchaseRequest.id == pr_id))).scalar_one()
    await db_session.refresh(pr, ["items"])

    # Test Case 3: Create Purchase Order (restricted to verifier_sp/verifier_da/admin)
    po_payload = PurchaseOrderCreate(
        vendor_name="Global Tech Solutions",
        vendor_address="123 High Street",
        vendor_gst="33AAAAA1111A1Z1",
        vendor_bank_account="999911112222",
        vendor_bank_name="State Bank of India",
        vendor_ifsc="SBIN0001234",
        po_amount=500.0,
        delivery_due_date=date(2026, 12, 31),
        remarks="Urgent delivery requested"
    )

    # Issue PO using verifier_sp user
    sp_user = (await db_session.execute(select(User).join(User.role).where(User.role.has(value="superintendent")))).scalars().first()
    assert sp_user is not None
    await db_session.refresh(sp_user, ["role"])

    po_response = await create_purchase_order(pr_id=pr.id, payload=po_payload, db=db_session, user=sp_user)
    assert po_response is not None
    assert "po_number" in po_response
    assert po_response["po_number"].startswith("PO/")

    # Retrieve PO
    retrieved_po = await get_purchase_order(pr_id=pr.id, db=db_session, user=sp_user)
    assert retrieved_po["po_number"] == po_response["po_number"]
    assert retrieved_po["vendor_name"] == "Global Tech Solutions"

    # Test Case 4: GIN and GRN Auto-generation via GrnService
    grn_svc = GrnService(db_session)
    delivery = await grn_svc.create_delivery(pr)
    assert delivery is not None
    assert delivery.gin_number is not None
    assert delivery.gin_number.startswith("GIN/")

    # Fetch delivery item to log stores receipt
    await db_session.refresh(delivery, ["items"])
    del_item = delivery.items[0]

    stores_log_data = {
        "quantity": 5,
        "condition": "working",
        "building": "CSE Building",
        "room": "Lab 102",
        "custodian_name": "Dr. R. K.",
        "serial_numbers": ["SN001", "SN002", "SN003", "SN004", "SN005"],
        "inspection_remarks": "Verified all 5 items physical specs and working condition"
    }
    stores_log = await grn_svc.log_stores_receipt(del_item.id, stores_log_data, sp_user)
    assert stores_log is not None
    assert stores_log.grn_number is not None
    assert stores_log.grn_number.startswith("GRN/")
    assert stores_log.inspection_remarks == "Verified all 5 items physical specs and working condition"

    # Test Case 5: Asset custodian fields and InstallationRecord
    # Trigger department receipt to complete reconciliation and create asset
    dept_log_data = {
        "quantity": 5,
        "condition": "good",
        "building": "CSE Building",
        "room": "Lab 102",
        "custodian_name": "Dr. R. K.",
        "serial_numbers": ["SN001", "SN002", "SN003", "SN004", "SN005"],
        "remarks": "Matches order details"
    }
    await grn_svc.log_dept_receipt(del_item.id, dept_log_data, hod)
    
    # Retrieve created Asset
    asset_res = await db_session.execute(select(Asset).where(Asset.delivery_item_id == del_item.id))
    asset = asset_res.scalars().first()
    assert asset is not None
    # Update custodian designation/department
    asset.custodian_designation = "Associate Professor"
    asset.custodian_department_id = hod.department_id
    await db_session.flush()

    # Record installation
    from app.routers.assets import InstallationRecordCreate
    inst_payload = InstallationRecordCreate(
        installation_date=date(2026, 7, 1),
        installed_by="Global Tech Solutions Service Eng",
        installation_scope="supplier",
        is_commissioned=True,
        certificate_path="/static/uploads/certs/inst_cert_123.pdf",
        remarks="Installed and commissioned successfully"
    )
    inst_res = await record_installation(asset_id=asset.id, payload=inst_payload, db=db_session, user=faculty)
    assert inst_res["message"] == "Installation record saved successfully"

    # Fetch installation records
    inst_records = await get_installation_records(asset_id=asset.id, db=db_session, user=faculty)
    assert len(inst_records) == 1
    assert inst_records[0]["installed_by"] == "Global Tech Solutions Service Eng"
    assert inst_records[0]["is_commissioned"] is True
