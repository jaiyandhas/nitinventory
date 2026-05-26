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
    
    # Generate faded 8% opacity watermark image and copy original logo to storage
    try:
        logo_path = os.path.join(os.path.dirname(__file__), "NITLOGO.png")
        dest_logo_path = os.path.join(settings.STORAGE_PATH, "NITLOGO.png")
        watermark_path = os.path.join(settings.STORAGE_PATH, "NITLOGO_watermark.png")
        
        if os.path.exists(logo_path):
            import shutil
            if not os.path.exists(dest_logo_path):
                shutil.copy(logo_path, dest_logo_path)
            if not os.path.exists(watermark_path):
                from PIL import Image
                img = Image.open(logo_path).convert("RGBA")
                alpha = img.split()[3]
                alpha = alpha.point(lambda p: int(p * 0.08))
                img.putalpha(alpha)
                img.save(watermark_path, "PNG")
    except Exception as e:
        import logging
        logging.exception("Failed to generate watermark or copy logo")

    yield


app = FastAPI(
    title="Institutional Resource & Inventory System (NIT Inventory)",
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
    return {"status": "ok", "system": "NIT Inventory", "institution": "NIT Tiruchirappalli"}
