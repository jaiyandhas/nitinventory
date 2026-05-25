from __future__ import annotations
from datetime import datetime
from typing import Optional, List, TYPE_CHECKING
from sqlalchemy import String, Integer, DateTime, Boolean, Float, ForeignKey, func, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
import enum

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.asset import Asset
    from app.models.purchase_request import PurchaseRequest


class DeliveryStatus(str, enum.Enum):
    PENDING = "pending"
    INITIATOR_CONFIRMED = "initiator_confirmed"
    DEPT_LOGGED = "dept_logged"
    STORES_LOGGED = "stores_logged"
    VERIFIED = "verified"
    DISCREPANCY = "discrepancy"


class DiscrepancyStatus(str, enum.Enum):
    OPEN = "open"
    RESOLVED = "resolved"


class PaymentStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    PAID = "paid"
    BLOCKED = "blocked"


class Delivery(Base):
    __tablename__ = "deliveries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    po_id: Mapped[int] = mapped_column(ForeignKey("purchase_requests.id"), nullable=False)
    challan_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    invoice_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    invoice_pdf_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    challan_pdf_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"), nullable=False)
    received_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default=DeliveryStatus.PENDING)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    items: Mapped[List["DeliveryItem"]] = relationship("DeliveryItem", back_populates="delivery", cascade="all, delete-orphan")
    department: Mapped["Department"] = relationship("Department")  # type: ignore
    payments: Mapped[List["Payment"]] = relationship("Payment", back_populates="delivery", cascade="all, delete-orphan")
    purchase_request: Mapped["PurchaseRequest"] = relationship("PurchaseRequest")


class DeliveryItem(Base):
    __tablename__ = "delivery_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    delivery_id: Mapped[int] = mapped_column(ForeignKey("deliveries.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    challan_quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[float] = mapped_column(Float, nullable=False)

    delivery: Mapped[Delivery] = relationship("Delivery", back_populates="items")
    dept_log: Mapped[Optional["DeptAssetLog"]] = relationship("DeptAssetLog", back_populates="delivery_item", uselist=False)
    stores_log: Mapped[Optional["StoresAssetLog"]] = relationship("StoresAssetLog", back_populates="delivery_item", uselist=False)
    discrepancy: Mapped[Optional["Discrepancy"]] = relationship("Discrepancy", back_populates="delivery_item", uselist=False)
    assets: Mapped[List["Asset"]] = relationship("Asset", back_populates="delivery_item")  # type: ignore


class DeptAssetLog(Base):
    """Immutable: HOD logs physical receipt. No update/delete allowed."""
    __tablename__ = "dept_asset_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    delivery_item_id: Mapped[int] = mapped_column(ForeignKey("delivery_items.id"), nullable=False, unique=True)
    logged_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    condition: Mapped[str] = mapped_column(String(50), nullable=False)  # good/damaged/partial
    building: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    room: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    custodian_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    serial_numbers: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    logged_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    delivery_item: Mapped[DeliveryItem] = relationship("DeliveryItem", back_populates="dept_log")
    logged_by: Mapped["User"] = relationship("User")  # type: ignore


class StoresAssetLog(Base):
    """Stores (VERIFIER_SP) logs document verification. Editable until approved."""
    __tablename__ = "stores_asset_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    delivery_item_id: Mapped[int] = mapped_column(ForeignKey("delivery_items.id"), nullable=False, unique=True)
    logged_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    condition: Mapped[str] = mapped_column(String(50), nullable=False)
    building: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    room: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    custodian_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    serial_numbers: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    is_approved: Mapped[bool] = mapped_column(Boolean, default=False)
    approved_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), onupdate=func.now())

    delivery_item: Mapped[DeliveryItem] = relationship("DeliveryItem", back_populates="stores_log")
    logged_by: Mapped["User"] = relationship("User", foreign_keys=[logged_by_id])  # type: ignore
    approved_by: Mapped[Optional["User"]] = relationship("User", foreign_keys=[approved_by_id])  # type: ignore


class Discrepancy(Base):
    __tablename__ = "discrepancies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    delivery_item_id: Mapped[int] = mapped_column(ForeignKey("delivery_items.id"), nullable=False, unique=True)
    challan_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    dept_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    stores_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default=DiscrepancyStatus.OPEN)
    resolution_remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resolved_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    delivery_item: Mapped[DeliveryItem] = relationship("DeliveryItem", back_populates="discrepancy")
    resolved_by: Mapped[Optional["User"]] = relationship("User")  # type: ignore


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    delivery_id: Mapped[int] = mapped_column(ForeignKey("deliveries.id"), nullable=False)
    invoice_number: Mapped[str] = mapped_column(String(100), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default=PaymentStatus.PENDING)
    approved_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    delivery: Mapped[Delivery] = relationship("Delivery", back_populates="payments")
    approved_by: Mapped[Optional["User"]] = relationship("User")  # type: ignore
