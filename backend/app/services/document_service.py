"""Persist uploaded PR documents to local storage."""
from __future__ import annotations
import os
import uuid
from datetime import datetime
from fastapi import UploadFile
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
        ext = os.path.splitext(upload.filename or "")[1].lower() or ".bin"
        filename = f"{uuid.uuid4().hex}{ext}"
        rel_path = os.path.join("attachments", str(pr.id), filename)
        abs_path = os.path.join(settings.STORAGE_PATH, rel_path)
        os.makedirs(os.path.dirname(abs_path), exist_ok=True)

        content = await upload.read()
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
