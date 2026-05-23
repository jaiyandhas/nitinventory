from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import os

from app.core.config import settings
from app.routers import auth, purchase_requests, budget, inventory, assets, admin

limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(settings.STORAGE_PATH, exist_ok=True)
    os.makedirs(os.path.join(settings.STORAGE_PATH, "qr"), exist_ok=True)
    os.makedirs(os.path.join(settings.STORAGE_PATH, "attachments"), exist_ok=True)
    os.makedirs(os.path.join(settings.STORAGE_PATH, "pdfs"), exist_ok=True)
    yield


app = FastAPI(
    title="IRIS — Institutional Resource & Inventory System",
    description="NIT Tiruchirappalli | Full procurement workflow + asset tracking",
    version="1.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static storage for QR images and documents
storage_path = settings.STORAGE_PATH
if os.path.exists(storage_path):
    app.mount("/storage", StaticFiles(directory=storage_path), name="storage")

# Include routers
app.include_router(auth.router)
app.include_router(purchase_requests.router)
app.include_router(budget.router)
app.include_router(inventory.router)
app.include_router(assets.router)
app.include_router(admin.router)


@app.get("/health")
async def health():
    return {"status": "ok", "system": "IRIS", "institution": "NIT Tiruchirappalli"}
