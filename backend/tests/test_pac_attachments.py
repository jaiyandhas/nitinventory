import pytest
from sqlalchemy import select
from app.models.purchase_request import PurchaseRequest, Document
from app.services.pdf_service import PDFService

@pytest.mark.asyncio
async def test_pac_attachments_seeded(db_session):
    # Setup test data
    from app.models.user import User
    from app.models.budget import ProcurementManager, PurchaseCategory, FinancialYear
    
    hod = (await db_session.execute(select(User).where(User.email == "hod.cse@nitt.edu"))).scalar_one()
    proc = (await db_session.execute(select(ProcurementManager).limit(1))).scalar_one()
    cat = (await db_session.execute(select(PurchaseCategory).limit(1))).scalar_one()
    fy = (await db_session.execute(select(FinancialYear).where(FinancialYear.is_active == True))).scalar_one()

    # Create PR 4
    pr4 = PurchaseRequest(
        icr_number="ICR/CSE/2026-27/004",
        amount=100000.0,
        purchase_type="department",
        initiator_id=hod.id,
        category_id=cat.id,
        financial_year_id=fy.id,
        procurement_id=proc.id,
        current_status="draft",
    )
    db_session.add(pr4)
    
    # Create PR 8
    pr8 = PurchaseRequest(
        icr_number="ICR/CSE/2026-27/008",
        amount=100000.0,
        purchase_type="department",
        initiator_id=hod.id,
        category_id=cat.id,
        financial_year_id=fy.id,
        procurement_id=proc.id,
        current_status="draft",
    )
    db_session.add(pr8)
    await db_session.flush()

    # Create documents for PR 4
    for key in ["dept_pac_file", "oem_pac_file", "oem_auth_file"]:
        db_session.add(Document(
            purchase_request_id=pr4.id,
            doc_key=key,
            doc_value={"path": f"storage/{key}.pdf", "original_name": f"{key}.pdf"},
            uploaded_by_id=hod.id
        ))

    # Create documents for PR 8
    for key in ["dept_pac_file", "oem_pac_file", "oem_auth_file"]:
        db_session.add(Document(
            purchase_request_id=pr8.id,
            doc_key=key,
            doc_value={"path": f"storage/{key}.pdf", "original_name": f"{key}.pdf"},
            uploaded_by_id=hod.id
        ))
    await db_session.flush()

    # Fetch PR 4 (Proprietary purchase)
    res_pr4 = await db_session.execute(
        select(PurchaseRequest).where(PurchaseRequest.icr_number == "ICR/CSE/2026-27/004")
    )
    pr4 = res_pr4.scalar_one_or_none()
    assert pr4 is not None

    # Verify PR 4 has PAC documents
    docs_pr4 = (await db_session.execute(
        select(Document).where(Document.purchase_request_id == pr4.id)
    )).scalars().all()
    
    doc_keys_pr4 = {d.doc_key for d in docs_pr4}
    assert "dept_pac_file" in doc_keys_pr4
    assert "oem_pac_file" in doc_keys_pr4
    assert "oem_auth_file" in doc_keys_pr4

    # Fetch PR 8 (Proprietary purchase)
    res_pr8 = await db_session.execute(
        select(PurchaseRequest).where(PurchaseRequest.icr_number == "ICR/CSE/2026-27/008")
    )
    pr8 = res_pr8.scalar_one_or_none()
    assert pr8 is not None

    # Verify PR 8 has PAC documents
    docs_pr8 = (await db_session.execute(
        select(Document).where(Document.purchase_request_id == pr8.id)
    )).scalars().all()
    
    doc_keys_pr8 = {d.doc_key for d in docs_pr8}
    assert "dept_pac_file" in doc_keys_pr8
    assert "oem_pac_file" in doc_keys_pr8
    assert "oem_auth_file" in doc_keys_pr8

    # Verify generated PDF template contains correct attachment status
    pdf_service = PDFService(db_session)
    pdf_bytes, filename, is_fallback_html, html_content = await pdf_service.generate_pr_pdf(pr4)
    assert html_content is not None
    
    # Check that "Yes" is printed instead of "No (Not Attached)" for all three files
    assert "No (Not Attached)" not in html_content
    # The checkmark boxes should contain ✓
    assert "✓" in html_content
