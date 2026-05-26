from __future__ import annotations
from typing import Optional, List
from pydantic import BaseModel, Field


class PRItemCreate(BaseModel):
    budget_file_id: int
    quantity: int = Field(default=1, ge=1)
    charges: Optional[float] = None
    requirement_type: str
    warranty: Optional[float] = None
    delivery_period: Optional[float] = None
    installation_required: bool = False
    site_readiness: bool = False
    site_readiness_remarks: Optional[str] = None
    gem_link: Optional[str] = None
    availability: str
    availability_remarks: Optional[str] = None
    present_stock: Optional[str] = None
    justification_for_procurement: Optional[str] = None
    previous_file_no_reference: Optional[str] = None
    tech_specs_text: str


class PRCreatePayload(BaseModel):
    selected_file_ids: List[int] = Field(min_length=1)
    mop: int
    nominee_id: Optional[int] = None
    basis_of_estimate: str
    emd: float
    performance_security: float
    is_service_center_south: bool = False
    service_center_location: Optional[str] = None
    service_center_south_desc: Optional[str] = None
    delivery_location: str
    delivery_mode: str
    is_quantity_split: bool = False
    split_quantity_justification: Optional[str] = None
    is_item_split: bool = False
    split_items_justification: Optional[str] = None
    exemption: bool = False
    exemption_remarks: Optional[str] = None
    training_required: bool = False
    training_type: Optional[str] = None
    training_vendor: Optional[str] = None
    purchase_type: str = "department"
    items: List[PRItemCreate]
