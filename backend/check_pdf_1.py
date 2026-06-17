import asyncio
import logging
from app.core.database import AsyncSessionLocal
from app.models.purchase_request import PurchaseRequest
from app.services.pdf_service import PDFService
from sqlalchemy import select

# Set up logging to catch WeasyPrint warnings
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("weasyprint")
logger.setLevel(logging.DEBUG)

async def main():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(PurchaseRequest).limit(1))
        pr = res.scalar_one_or_none()
        if not pr:
            print("No PR found in database.")
            return
        print(f"Found PR ID: {pr.id}")
        pdf_service = PDFService(db)
        pdf_bytes, filename, is_fallback, html_content = await pdf_service.generate_pr_pdf(pr)
        print(f"PDF bytes length: {len(pdf_bytes) if pdf_bytes else 'None'}")
        print(f"Is fallback: {is_fallback}")
        
        if pdf_bytes:
            with open("test_output.pdf", "wb") as f:
                f.write(pdf_bytes)
            print("Successfully saved to test_output.pdf")

if __name__ == "__main__":
    asyncio.run(main())
