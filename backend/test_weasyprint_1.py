import os
import logging
import weasyprint
from app.core.config import settings

# Configure logging to stdout
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger("weasyprint")
logger.setLevel(logging.DEBUG)

def test():
    html_content = f"""
    <html>
    <body>
    <h1>Test PDF</h1>
    <p>Image 1 (relative): <img src="NITLOGO.png" style="height: 50px;" /></p>
    <p>Image 2 (file:// absolute): <img src="file://{os.path.join(settings.STORAGE_PATH, 'NITLOGO.png')}" style="height: 50px;" /></p>
    <p>Image 3 (invalid relative): <img src="invalid.png" style="height: 50px;" /></p>
    </body>
    </html>
    """
    try:
        pdf_bytes = weasyprint.HTML(string=html_content, base_url=settings.STORAGE_PATH).write_pdf()
        print("PDF generated successfully. Size:", len(pdf_bytes))
    except Exception as e:
        print("WeasyPrint error:", e)

if __name__ == "__main__":
    test()
