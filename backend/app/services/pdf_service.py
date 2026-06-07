"""PDF generation service for purchase requests."""
import io
import math
import os
import urllib.parse
import weasyprint
from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple

from fastapi import HTTPException
from fastapi.templating import Jinja2Templates
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.purchase_request import (
    PurchaseRequest,
    PurchaseRequestItem,
    PurchaseRequestAssignment,
    Document,
    PRReferral,
)
from app.models.user import User, RoleManager
from app.models.budget import BudgetMaster


def to_local_time(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    ist_tz = timezone(timedelta(hours=5, minutes=30))
    return dt.astimezone(ist_tz)


def number_to_words_inr(num: float) -> str:
    if num is None:
        return ""
    
    ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
            "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
    tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]
    
    def _convert_below_thousand(n):
        res = ""
        if n >= 100:
            res += ones[n // 100] + " Hundred "
            n %= 100
        if n >= 20:
            res += tens[n // 10]
            if n % 10 > 0:
                res += " " + ones[n % 10]
        elif n > 0:
            res += ones[n]
        return res.strip()
    
    rupees = int(math.floor(num))
    paise = int(round((num - rupees) * 100))
    
    if rupees == 0:
        rupee_str = "Zero Rupees"
    else:
        parts = []
        if rupees >= 10000000:
            crores = rupees // 10000000
            parts.append(_convert_below_thousand(crores) + " Crore")
            rupees %= 10000000
        if rupees >= 100000:
            lakhs = rupees // 100000
            parts.append(_convert_below_thousand(lakhs) + " Lakh")
            rupees %= 100000
        if rupees >= 1000:
            thousands = rupees // 1000
            parts.append(_convert_below_thousand(thousands) + " Thousand")
            rupees %= 1000
        if rupees > 0:
            parts.append(_convert_below_thousand(rupees))
        rupee_str = " ".join(parts).strip() + " Rupees"
        
    if paise > 0:
        paise_str = _convert_below_thousand(paise) + " Paise"
        return f"{rupee_str} and {paise_str} Only"
    else:
        return f"{rupee_str} Only"


class PDFService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def generate_pr_pdf(
        self, pr: PurchaseRequest, module: Optional[str] = None
    ) -> Tuple[Optional[bytes], str, bool, str]:
        """
        Renders the purchase request using Jinja2 templates and compiles it to a PDF using WeasyPrint.
        If WeasyPrint compilation fails, returns the raw HTML content for fallback rendering.
        
        Returns:
            Tuple[Optional[bytes], filename, is_fallback_html, html_content]
        """
        # Fetch PR with all relationships loaded using selectinload
        stmt = (
            select(PurchaseRequest)
            .options(
                selectinload(PurchaseRequest.initiator).selectinload(User.department),
                selectinload(PurchaseRequest.purchase_category),
                selectinload(PurchaseRequest.procurement),
                selectinload(PurchaseRequest.items).selectinload(PurchaseRequestItem.budget_file).options(
                    selectinload(BudgetMaster.expert1),
                    selectinload(BudgetMaster.expert2),
                    selectinload(BudgetMaster.director_faculty),
                ),
                selectinload(PurchaseRequest.history),
                selectinload(PurchaseRequest.commercial_evaluations),
                selectinload(PurchaseRequest.technical_evaluations),
                selectinload(PurchaseRequest.financial_evaluations),
                selectinload(PurchaseRequest.assignments).selectinload(PurchaseRequestAssignment.assigned_by),
                selectinload(PurchaseRequest.faculty1).selectinload(User.department),
                selectinload(PurchaseRequest.faculty2).selectinload(User.department),
                selectinload(PurchaseRequest.faculty3).selectinload(User.department),
                selectinload(PurchaseRequest.aa_approver).selectinload(User.department),
                selectinload(PurchaseRequest.bill_passing),
                selectinload(PurchaseRequest.deliveries),
                selectinload(PurchaseRequest.documents).selectinload(Document.uploaded_by),
                selectinload(PurchaseRequest.referrals).options(
                    selectinload(PRReferral.referred_by),
                    selectinload(PRReferral.referred_to),
                ),
            )
            .where(PurchaseRequest.id == pr.id)
        )
        res = await self.db.execute(stmt)
        pr = res.scalar_one()

        # Resolve HOD
        hod_user = None
        if pr.initiator and pr.initiator.department_id:
            hod_res = await self.db.execute(
                select(User)
                .join(RoleManager, User.role_id == RoleManager.id)
                .where(
                    and_(
                        User.department_id == pr.initiator.department_id,
                        RoleManager.group_key == "hod"
                    )
                )
            )
            hod_user = hod_res.scalar_one_or_none()

        def to_file_url(rel_path):
            if not rel_path:
                return None
            clean_path = rel_path
            if clean_path.startswith("/storage/"):
                clean_path = clean_path[9:]
            elif clean_path.startswith("storage/"):
                clean_path = clean_path[8:]
            elif clean_path.startswith("/"):
                clean_path = clean_path[1:]
            
            full_path = os.path.join(settings.STORAGE_PATH, clean_path)
            return f"file://{urllib.parse.quote(full_path, safe='/')}"

        def get_valid_signature_url(rel_path):
            if not rel_path:
                return None
            clean_path = rel_path
            if clean_path.startswith("/storage/"):
                clean_path = clean_path[9:]
            elif clean_path.startswith("storage/"):
                clean_path = clean_path[8:]
            elif clean_path.startswith("/"):
                clean_path = clean_path[1:]
            full_path = os.path.join(settings.STORAGE_PATH, clean_path)
            if os.path.exists(full_path):
                return to_file_url(clean_path)
            return None

        dept = pr.initiator.department if (pr.initiator and pr.initiator.department) else None
        
        # Calculate fallback nominees
        f1_id = pr.faculty1_id or (dept.expert1_id if dept else None)
        f2_id = pr.faculty2_id or (dept.expert2_id if dept else None)
        f3_id = pr.faculty3_id or (dept.director_faculty_id if dept else None)
        
        # Inject fallback values in-memory
        pr.faculty1_id = f1_id
        pr.faculty2_id = f2_id
        pr.faculty3_id = f3_id
        
        # Load user objects if null
        if f1_id and not pr.faculty1:
            res1 = await self.db.execute(select(User).options(selectinload(User.department)).where(User.id == f1_id))
            pr.faculty1 = res1.scalar_one_or_none()
        if f2_id and not pr.faculty2:
            res2 = await self.db.execute(select(User).options(selectinload(User.department)).where(User.id == f2_id))
            pr.faculty2 = res2.scalar_one_or_none()
        if f3_id and not pr.faculty3:
            res3 = await self.db.execute(select(User).options(selectinload(User.department)).where(User.id == f3_id))
            pr.faculty3 = res3.scalar_one_or_none()

        # Helper to find frozen signature from history for a given user ID
        def find_frozen_signature(user_id: int, status_filter=None):
            if not user_id:
                return None, None
            sorted_hist = sorted(pr.history, key=lambda x: x.acted_at or datetime.min, reverse=True)
            for h in sorted_hist:
                if h.current_approver_id == user_id:
                    if status_filter is None or h.status in status_filter:
                        sig_url = get_valid_signature_url(h.frozen_signature_path)
                        if sig_url:
                            return sig_url, h.acted_at
                        # Fallback to dynamic for legacy entries or missing files
                        if user_id == pr.initiator_id and pr.initiator:
                            sig_url = get_valid_signature_url(pr.initiator.signature_path)
                            if sig_url:
                                return sig_url, h.acted_at
                        elif user_id == pr.faculty1_id and pr.faculty1:
                            sig_url = get_valid_signature_url(pr.faculty1.signature_path)
                            if sig_url:
                                return sig_url, h.acted_at
                        elif user_id == pr.faculty2_id and pr.faculty2:
                            sig_url = get_valid_signature_url(pr.faculty2.signature_path)
                            if sig_url:
                                return sig_url, h.acted_at
                        elif user_id == pr.faculty3_id and pr.faculty3:
                            sig_url = get_valid_signature_url(pr.faculty3.signature_path)
                            if sig_url:
                                return sig_url, h.acted_at
                        elif user_id == pr.aa_approver_id and pr.aa_approver:
                            sig_url = get_valid_signature_url(pr.aa_approver.signature_path)
                            if sig_url:
                                return sig_url, h.acted_at
                        elif hod_user and user_id == hod_user.id:
                            sig_url = get_valid_signature_url(hod_user.signature_path)
                            if sig_url:
                                return sig_url, h.acted_at
            return None, None

        # Resolve signatures (frozen or fallback)
        initiator_sig, initiator_date = find_frozen_signature(pr.initiator_id)
        faculty1_sig, faculty1_date = find_frozen_signature(pr.faculty1_id, ["Technical Evaluation Approved", "Technical Evaluation Completed"])
        faculty2_sig, faculty2_date = find_frozen_signature(pr.faculty2_id, ["Technical Evaluation Approved", "Technical Evaluation Completed"])
        faculty3_sig, faculty3_date = find_frozen_signature(pr.faculty3_id, ["Technical Evaluation Approved", "Technical Evaluation Completed"])
        hod_sig, hod_date = find_frozen_signature(hod_user.id if hod_user else None)
        aa_sig, aa_date = find_frozen_signature(pr.aa_approver_id)

        # Find Dean/Registrar/Director/Audit from history
        dean_sig = None
        dean_date = None
        director_sig = None
        director_date = None
        dr_ar_sp_sig = None
        dr_ar_sp_date = None
        dr_ar_fa_sig = None
        dr_ar_fa_date = None
        ia_sig = None
        ia_date = None

        for h in pr.history:
            if h.current_approver_id:
                actor_res = await self.db.execute(
                    select(User)
                    .options(selectinload(User.role))
                    .where(User.id == h.current_approver_id)
                )
                actor = actor_res.scalar_one_or_none()
                if actor and actor.role:
                    sig_url = get_valid_signature_url(h.frozen_signature_path)
                    if not sig_url and actor.signature_path:
                        sig_url = get_valid_signature_url(actor.signature_path)
                    if sig_url:
                        if actor.role.group_key == "dean_approver":
                            dean_sig = sig_url
                            dean_date = h.acted_at
                        elif actor.role.group_key == "apex_approver":
                            director_sig = sig_url
                            director_date = h.acted_at
                        elif actor.role.value in ("superintendent", "consultant_sp") or actor.role.group_key == "verifier_sp":
                            dr_ar_sp_sig = sig_url
                            dr_ar_sp_date = h.acted_at
                        elif actor.role.value in ("deputy_registrar", "assistant_registrar"):
                            dr_ar_fa_sig = sig_url
                            dr_ar_fa_date = h.acted_at
                        elif actor.role.value == "internal_audit" or "audit" in actor.role.name.lower():
                            ia_sig = sig_url
                            ia_date = h.acted_at

        history_serialized = []
        for h in sorted(pr.history, key=lambda x: x.acted_at or datetime.min):
            if h.status in ("Forwarded", "Forwarded to next phase"):
                has_specific_entry = any(
                    other.current_approver_id == h.current_approver_id
                    and other.status
                    and other.status not in ("Forwarded", "Forwarded to next phase")
                    and other.acted_at
                    and h.acted_at
                    and abs((other.acted_at - h.acted_at).total_seconds()) < 60
                    for other in pr.history
                )
                if has_specific_entry:
                    continue
            actor_name = h.frozen_actor_name or "System"
            designation = h.frozen_designation or "-"
            signature_url = get_valid_signature_url(h.frozen_signature_path)
            if not signature_url and h.current_approver_id:
                actor_res = await self.db.execute(
                    select(User)
                    .options(selectinload(User.role))
                    .where(User.id == h.current_approver_id)
                )
                actor = actor_res.scalar_one_or_none()
                if actor:
                    actor_name = actor.name
                    designation = actor.designation or (actor.role.name if actor.role else "-")
                    if actor.signature_path:
                        signature_url = get_valid_signature_url(actor.signature_path)
            local_acted_at = to_local_time(h.acted_at)
            history_serialized.append({
                "actor_name": actor_name,
                "designation": designation,
                "status": h.status,
                "remarks": h.remarks or "-",
                "signature_url": signature_url,
                "acted_at_str": local_acted_at.strftime("%d/%m/%Y %H:%M") if local_acted_at else "-"
            })

        local_created_at = to_local_time(pr.created_at)
        local_aa_approved_at = to_local_time(pr.aa_approved_at)

        # Date formatted strings
        pr_created_at_str = local_created_at.strftime("%d/%m/%Y %H:%M") if local_created_at else "-"
        pr_aa_approved_at_str = local_aa_approved_at.strftime("%d/%m/%Y %H:%M") if local_aa_approved_at else "-"
        initiator_date_str = to_local_time(initiator_date).strftime("%d/%m/%Y") if initiator_date else "-"
        faculty1_date_str = to_local_time(faculty1_date).strftime("%d/%m/%Y") if faculty1_date else "-"
        faculty2_date_str = to_local_time(faculty2_date).strftime("%d/%m/%Y") if faculty2_date else "-"
        faculty3_date_str = to_local_time(faculty3_date).strftime("%d/%m/%Y") if faculty3_date else "-"
        hod_date_str = to_local_time(hod_date).strftime("%d/%m/%Y") if hod_date else "-"
        aa_date_str = to_local_time(aa_date).strftime("%d/%m/%Y") if aa_date else "-"
        dean_date_str = to_local_time(dean_date).strftime("%d/%m/%Y") if dean_date else "-"
        director_date_str = to_local_time(director_date).strftime("%d/%m/%Y") if director_date else "-"
        dr_ar_sp_date_str = to_local_time(dr_ar_sp_date).strftime("%d/%m/%Y") if dr_ar_sp_date else "-"
        dr_ar_fa_date_str = to_local_time(dr_ar_fa_date).strftime("%d/%m/%Y") if dr_ar_fa_date else "-"
        ia_date_str = to_local_time(ia_date).strftime("%d/%m/%Y") if ia_date else "-"

        # Pre-calculate item details with unit cost, GST amount, and total cost
        items_details = []
        calculated_grand_total = 0.0
        for idx, item in enumerate(pr.items):
            qty = item.quantity or 1
            unit_cost = item.estimated_total / qty
            gst_pct = item.charges or 0.0
            gst_amount = qty * unit_cost * gst_pct / 100.0
            total_cost = (qty * unit_cost) + gst_amount
            calculated_grand_total += total_cost
            items_details.append({
                "s_no": idx + 1,
                "description": item.item_description,
                "qty": qty,
                "unit_cost": unit_cost,
                "gst_pct": gst_pct,
                "gst_amount": gst_amount,
                "total_cost": total_cost,
                "availability": item.availability,
                "present_stock": item.present_stock,
                "previous_file_no_reference": item.previous_file_no_reference,
                "justification_for_procurement": item.justification_for_procurement,
                "warranty": item.warranty,
                "delivery_period": item.delivery_period,
                "tech_specs_text": item.tech_specs_text,
                "budget_file_id": item.budget_file_id,
                "budget_file": item.budget_file
            })
        grand_total_words = number_to_words_inr(calculated_grand_total)

        # Resolve final competent sanctioning authority details for footer
        sanction_authority_name = None
        sanction_authority_sig = None
        sanction_authority_date_str = None

        if pr.fs_approved_at:
            # Category 3 (>10L) -> Director
            if pr.amount and pr.amount > 1000000.0:
                director_user = None
                for h in pr.history:
                    if h.current_approver_id:
                        actor_res = await self.db.execute(
                            select(User).options(selectinload(User.role)).where(User.id == h.current_approver_id)
                        )
                        actor = actor_res.scalar_one_or_none()
                        if actor and actor.role and actor.role.group_key == "apex_approver":
                            director_user = actor
                            break
                if director_user:
                    sanction_authority_name = director_user.name
                    sanction_authority_sig = director_sig
                    sanction_authority_date_str = to_local_time(pr.fs_approved_at).strftime("%d/%m/%Y %H:%M")
            # Category 2 (1L-10L) -> Dean P&D
            elif pr.amount and pr.amount > 100000.0:
                dean_user = None
                for h in pr.history:
                    if h.current_approver_id:
                        actor_res = await self.db.execute(
                            select(User).options(selectinload(User.role)).where(User.id == h.current_approver_id)
                        )
                        actor = actor_res.scalar_one_or_none()
                        if actor and actor.role and actor.role.group_key == "dean_approver":
                            dean_user = actor
                            break
                if dean_user:
                    sanction_authority_name = dean_user.name
                    sanction_authority_sig = dean_sig
                    sanction_authority_date_str = to_local_time(pr.fs_approved_at).strftime("%d/%m/%Y %H:%M")

        # Fallback to Administrative Approval
        if not sanction_authority_name:
            if pr.aa_approver:
                sanction_authority_name = pr.aa_approver.name
                sanction_authority_sig = aa_sig
                sanction_authority_date_str = pr_aa_approved_at_str
            else:
                sanction_authority_name = "Sanctioning Authority"
                sanction_authority_sig = None
                sanction_authority_date_str = None

        # Serialize referrals and documents for Dossier copies
        referrals_serialized = []
        for r in sorted(pr.referrals or [], key=lambda x: x.created_at or datetime.min):
            created_local = to_local_time(r.created_at)
            responded_local = to_local_time(r.responded_at) if r.responded_at else None
            referrals_serialized.append({
                "referred_by_name": r.referred_by.name if r.referred_by else f"User {r.referred_by_id}",
                "referred_to_name": r.referred_to.name if r.referred_to else f"User {r.referred_to_id}",
                "query": r.query,
                "response": r.response or "-",
                "query_document_path": r.query_document_path,
                "response_document_path": r.response_document_path,
                "status": r.status,
                "created_at_str": created_local.strftime("%d/%m/%Y %H:%M") if created_local else "-",
                "responded_at_str": responded_local.strftime("%d/%m/%Y %H:%M") if responded_local else "-"
            })

        documents_serialized = []
        for d in pr.documents or []:
            updated_local = to_local_time(d.updated_at)
            uploaded_by_name = d.uploaded_by.name if d.uploaded_by else "System"
            
            doc_label = d.doc_key.replace("_", " ").title()
            if d.doc_key == "draft_tender_document":
                doc_label = "Draft Tender Document"
            elif d.doc_key == "tender_document":
                doc_label = "Final Tender Document"
                
            documents_serialized.append({
                "doc_key": d.doc_key,
                "doc_label": doc_label,
                "original_name": d.doc_value.get("original_name") or "Unnamed Document",
                "path": f"/static/uploads/{d.doc_value.get('path')}" if d.doc_value.get("path") else None,
                "uploaded_by_name": uploaded_by_name,
                "uploaded_at_str": updated_local.strftime("%d/%m/%Y %H:%M") if updated_local else "-"
            })

        templates = Jinja2Templates(directory="app/templates")
        html_content = templates.get_template("administrative_approval.html").render({
            "pr": pr,
            "module": module,
            "history_serialized": history_serialized,
            "referrals_serialized": referrals_serialized,
            "documents_serialized": documents_serialized,
            "storage_dir": settings.STORAGE_PATH,
            "pr_created_at_str": pr_created_at_str,
            "pr_aa_approved_at_str": pr_aa_approved_at_str,
            "initiator_sig": initiator_sig,
            "initiator_date_str": initiator_date_str,
            "faculty1_sig": faculty1_sig,
            "faculty1_date_str": faculty1_date_str,
            "faculty2_sig": faculty2_sig,
            "faculty2_date_str": faculty2_date_str,
            "faculty3_sig": faculty3_sig,
            "faculty3_date_str": faculty3_date_str,
            "hod_sig": hod_sig,
            "hod_date_str": hod_date_str,
            "aa_sig": aa_sig,
            "aa_date_str": aa_date_str,
            "dean_sig": dean_sig,
            "dean_date_str": dean_date_str,
            "director_sig": director_sig,
            "director_date_str": director_date_str,
            "dr_ar_sp_sig": dr_ar_sp_sig,
            "dr_ar_sp_date_str": dr_ar_sp_date_str,
            "dr_ar_fa_sig": dr_ar_fa_sig,
            "dr_ar_fa_date_str": dr_ar_fa_date_str,
            "ia_sig": ia_sig,
            "ia_date_str": ia_date_str,
            "hod_user": hod_user,
            "items_details": items_details,
            "grand_total": calculated_grand_total,
            "grand_total_words": grand_total_words,
            "sanction_authority_name": sanction_authority_name,
            "sanction_authority_sig": sanction_authority_sig,
            "sanction_authority_date_str": sanction_authority_date_str,
        })

        filename_prefix = f"module_{module}" if module else "administrative_approval"
        filename = f"{filename_prefix}_pr_{pr.id}.pdf"

        try:
            pdf_bytes = weasyprint.HTML(string=html_content, base_url=settings.STORAGE_PATH).write_pdf()
            return pdf_bytes, filename, False, html_content
        except Exception as e:
            import logging
            logging.exception("WeasyPrint PDF generation failed, falling back to HTML representation")
            return None, filename, True, html_content
