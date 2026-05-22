"""QR code generation service using qrcode library."""
import os
import qrcode
from app.core.config import settings


class QrService:
    def generate(self, asset_tag: str) -> str:
        """Generate a QR code PNG for an asset tag. Returns the public URL path."""
        qr_dir = os.path.join(settings.STORAGE_PATH, "qr")
        os.makedirs(qr_dir, exist_ok=True)

        public_url = f"{settings.FRONTEND_URL}/public/asset/{asset_tag}"
        img = qrcode.make(public_url)
        file_path = os.path.join(qr_dir, f"{asset_tag}.png")
        img.save(file_path)

        return f"/storage/qr/{asset_tag}.png"
