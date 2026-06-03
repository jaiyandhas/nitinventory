from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
import os
import logging
import json
import contextvars
import uuid
from datetime import datetime, timezone

from app.core.config import settings
from app.routers import auth, purchase_requests, budget, inventory, assets, admin
from app.core.limiter import limiter

request_id_contextvar = contextvars.ContextVar("request_id", default=None)


class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_record = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
            "filename": record.filename,
            "lineno": record.lineno,
        }
        request_id = request_id_contextvar.get(None)
        if request_id:
            log_record["request_id"] = request_id
        return json.dumps(log_record)


def setup_logging():
    root_handler = logging.StreamHandler()
    root_handler.setFormatter(JsonFormatter())
    
    root = logging.getLogger()
    for h in list(root.handlers):
        root.removeHandler(h)
    root.addHandler(root_handler)
    root.setLevel(logging.INFO)
    
    for logger_name in ("uvicorn", "uvicorn.error", "uvicorn.access", "fastapi"):
        logger = logging.getLogger(logger_name)
        for h in list(logger.handlers):
            logger.removeHandler(h)
        logger.addHandler(root_handler)
        logger.propagate = False


setup_logging()


class SecureStaticFiles(StaticFiles):
    def file_response(self, *args, **kwargs):
        response = super().file_response(*args, **kwargs)
        response.headers["Content-Disposition"] = "attachment"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response


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

@app.middleware("http")
async def log_requests_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
    token = request_id_contextvar.set(request_id)
    try:
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response
    finally:
        request_id_contextvar.reset(token)


storage_path = settings.STORAGE_PATH
if os.path.exists(storage_path):
    app.mount("/storage", StaticFiles(directory=storage_path), name="storage")
    app.mount("/static/uploads", SecureStaticFiles(directory=storage_path), name="static_uploads")

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
