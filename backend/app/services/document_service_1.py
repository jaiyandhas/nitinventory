"""Persist uploaded PR documents to local storage."""
from __future__ import annotations
import os
import uuid
from datetime import datetime
from fastapi import UploadFile, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.purchase_request import Document, PurchaseRequest


class DocumentService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def save_upload(
        self,
        pr: PurchaseRequest,
        doc_key: str,
        upload: UploadFile,
        uploaded_by_id: int | None,
    ) -> Document:
        ext = os.path.splitext(upload.filename or "")[1].lower()
        if ext not in {".pdf", ".png", ".jpg", ".jpeg"}:
            raise HTTPException(status_code=400, detail="Invalid file extension. Only PDF, PNG, JPG, and JPEG are allowed.")

        content = await upload.read()
        if len(content) > 10 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="File size exceeds the 10MB limit.")

        # Magic bytes validation
        header = content[:4]
        if ext == ".pdf":
            if not header.startswith(b'%PDF'):
                raise HTTPException(status_code=400, detail="Invalid PDF file format.")
        elif ext == ".png":
            if not header.startswith(b'\x89PNG'):
                raise HTTPException(status_code=400, detail="Invalid PNG file format.")
        elif ext in (".jpg", ".jpeg"):
            if not header.startswith(b'\xff\xd8\xff'):
                raise HTTPException(status_code=400, detail="Invalid JPEG file format.")

        filename = f"{uuid.uuid4().hex}{ext}"
        rel_path = os.path.join("attachments", str(pr.id), filename)
        abs_path = os.path.join(settings.STORAGE_PATH, rel_path)
        os.makedirs(os.path.dirname(abs_path), exist_ok=True)

        with open(abs_path, "wb") as f:
            f.write(content)

        doc = Document(
            purchase_request_id=pr.id,
            doc_key=doc_key,
            doc_value={"path": rel_path, "original_name": upload.filename},
            uploaded_by_id=uploaded_by_id,
            updated_at=datetime.utcnow(),
        )
        self.db.add(doc)
        return doc

