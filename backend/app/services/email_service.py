"""Email service using smtplib + database queue + FastAPI BackgroundTasks."""
import smtplib
import logging
from datetime import datetime
from typing import Optional
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from fastapi import BackgroundTasks
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import select

from app.core.config import settings
from app.models.purchase_request import EmailQueue

logger = logging.getLogger(__name__)

# Engine for background tasks since they might run outside request lifespan
engine = create_async_engine(settings.DATABASE_URL, echo=False)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def send_and_log_email(to_email: str, subject: str, body: str):
    """Background task to insert mail in email_queue, send via SMTP, and log result."""
    async with SessionLocal() as db:
        queue_entry = EmailQueue(
            subject=subject,
            body=body,
            recipient=to_email,
            sent=False,
            created_at=datetime.utcnow()
        )
        db.add(queue_entry)
        await db.commit()
        await db.refresh(queue_entry)
        queue_id = queue_entry.id

    sent_successfully = False
    error_msg = None
    smtp_from = settings.SMTP_FROM or settings.SMTP_USER

    # Use SMTP_PASSWORD or SMTP_PASS
    smtp_pass = settings.SMTP_PASSWORD or settings.SMTP_PASS

    if settings.SMTP_HOST and settings.SMTP_USER:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = smtp_from
            msg["To"] = to_email
            msg.attach(MIMEText(body, "html"))
            
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                server.starttls()
                server.login(settings.SMTP_USER, smtp_pass)
                server.sendmail(smtp_from, to_email, msg.as_string())
            sent_successfully = True
            logger.info(f"[EMAIL SUCCESS] Sent to {to_email}: {subject}")
        except Exception as e:
            error_msg = str(e)
            logger.error(f"[EMAIL ERROR] Failed to send email to {to_email}: {e}")
    else:
        error_msg = "SMTP not configured"
        logger.info(f"[EMAIL SKIP] No SMTP configured. Would send to {to_email}: {subject}")

    # Update DB entry
    async with SessionLocal() as db:
        res = await db.execute(select(EmailQueue).where(EmailQueue.id == queue_id))
        entry = res.scalar_one_or_none()
        if entry:
            entry.sent = sent_successfully
            entry.error_message = error_msg
            if sent_successfully:
                entry.sent_at = datetime.utcnow()
            await db.commit()


class EmailService:
    def __init__(self, background_tasks: Optional[BackgroundTasks] = None):
        self.background_tasks = background_tasks

    def _queue_email(self, to: str, subject: str, body: str):
        if self.background_tasks:
            self.background_tasks.add_task(send_and_log_email, to, subject, body)
        else:
            # Fallback to fire-and-forget task in the running loop
            import asyncio
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(send_and_log_email(to, subject, body))
            except RuntimeError:
                # No running loop, run synchronously
                asyncio.run(send_and_log_email(to, subject, body))

    def notify_next_approver(self, pr_id: int, icr_number: Optional[str], group_key: str, to_email: str) -> None:
        subject = f"[IRIS] Action Required: PR {icr_number or f'#{pr_id}'} Pending Approval"
        body = f"""
        <h2>IRIS — Institutional Resource & Inventory System</h2>
        <p>Purchase Request <strong>{icr_number or f'#{pr_id}'}</strong> has advanced to your group (<strong>{group_key}</strong>) and requires your review.</p>
        <p>Please login to the <a href="{settings.FRONTEND_URL}/pr/{pr_id}">IRIS Portal</a> to act on this request.</p>
        <hr><small>NIT Tiruchirappalli — IRIS System</small>
        """
        self._queue_email(to_email, subject, body)

    def notify_rejection(self, pr_id: int, icr_number: Optional[str], rejected_by_name: str, reason: str, to_email: str) -> None:
        subject = f"[IRIS] PR {icr_number or f'#{pr_id}'} Rejected"
        body = f"""
        <h2>IRIS — PR Rejected</h2>
        <p>Your Purchase Request <strong>{icr_number or f'#{pr_id}'}</strong> has been rejected.</p>
        <p><strong>Rejected by:</strong> {rejected_by_name}</p>
        <p><strong>Remarks/Reason:</strong> {reason}</p>
        <p>Please login to <a href="{settings.FRONTEND_URL}/pr/{pr_id}">IRIS</a> to view details.</p>
        <hr><small>NIT Tiruchirappalli — IRIS System</small>
        """
        self._queue_email(to_email, subject, body)

    def notify_send_back(self, pr_id: int, icr_number: Optional[str], sent_back_by_name: str, reason: str, to_email: str) -> None:
        subject = f"[IRIS] PR {icr_number or f'#{pr_id}'} Sent Back"
        body = f"""
        <h2>IRIS — PR Sent Back</h2>
        <p>Your Purchase Request <strong>{icr_number or f'#{pr_id}'}</strong> has been sent back for corrections.</p>
        <p><strong>Sent back by:</strong> {sent_back_by_name}</p>
        <p><strong>Remarks:</strong> {reason}</p>
        <p>Please login to <a href="{settings.FRONTEND_URL}/pr/{pr_id}">IRIS</a> to make necessary changes.</p>
        <hr><small>NIT Tiruchirappalli — IRIS System</small>
        """
        self._queue_email(to_email, subject, body)

    def notify_discrepancy(self, delivery_item_id: int, to_email: str) -> None:
        subject = "[IRIS] Quantity Discrepancy Detected — Action Required"
        body = f"""
        <h2>IRIS — Discrepancy Alert</h2>
        <p>A quantity discrepancy has been detected for Delivery Item #{delivery_item_id}.</p>
        <p>Payment has been <strong>blocked</strong> until resolved.</p>
        <p>Please login to <a href="{settings.FRONTEND_URL}/inventory/discrepancies">IRIS</a> to resolve.</p>
        """
        self._queue_email(to_email, subject, body)

    def notify_assets_created(self, asset_tags: list, to_email: str) -> None:
        tags_html = "".join(f"<li>{tag}</li>" for tag in asset_tags)
        subject = f"[IRIS] {len(asset_tags)} Asset(s) Created"
        body = f"""
        <h2>IRIS — Assets Created</h2>
        <p>The following assets have been registered:</p>
        <ul>{tags_html}</ul>
        <p>Payment notification has been triggered.</p>
        """
        self._queue_email(to_email, subject, body)
