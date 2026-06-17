from pydantic import BaseModel, Field
from typing import Optional
from datetime import date

class PurchaseOrderCreate(BaseModel):
    vendor_name: str = Field(..., max_length=255)
    vendor_address: Optional[str] = None
    vendor_gst: Optional[str] = Field(None, max_length=20)
    vendor_bank_account: Optional[str] = Field(None, max_length=100)
    vendor_bank_name: Optional[str] = Field(None, max_length=255)
    vendor_ifsc: Optional[str] = Field(None, max_length=20)
    po_amount: float = Field(..., ge=0.0)
    delivery_due_date: Optional[date] = None
    ps_amount: Optional[float] = Field(None, ge=0.0)
    ps_mode: Optional[str] = Field(None, max_length=50)
    ps_validity: Optional[date] = None
    emd_amount: Optional[float] = Field(None, ge=0.0)
    ld_applicable: bool = False
    remarks: Optional[str] = None
