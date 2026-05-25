from __future__ import annotations
from datetime import datetime, date
from typing import Optional, List, TYPE_CHECKING
from sqlalchemy import String, Integer, DateTime, Date, Boolean, Float, ForeignKey, func, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
import enum

if TYPE_CHECKING:
    from app.models.user import User, Department
    from app.models.inventory import DeliveryItem


class AssetCondition(str, enum.Enum):
    WORKING = "working"
    DAMAGED = "damaged"
    UNDER_REPAIR = "under_repair"
    OBSOLETE = "obsolete"


class AssetCategory(str, enum.Enum):
    LAB_EQUIPMENT = "lab_equipment"
    FURNITURE = "furniture"
    COMPUTER = "computer"
    OTHER = "other"


class DisposalStatus(str, enum.Enum):
    ACTIVE = "active"
    PENDING_DISPOSAL = "pending_disposal"
    DISPOSED = "disposed"


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    asset_tag: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)  # NIT-CSE-001
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"), nullable=False)
    building: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    room: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    custodian: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    serial_number: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    condition: Mapped[str] = mapped_column(String(50), default=AssetCondition.WORKING)
    disposal_status: Mapped[str] = mapped_column(String(50), default=DisposalStatus.ACTIVE)
    qr_code_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    purchase_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    unit_cost: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    warranty_expiry: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    delivery_item_id: Mapped[Optional[int]] = mapped_column(ForeignKey("delivery_items.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    department: Mapped["Department"] = relationship("Department", back_populates="assets")  # type: ignore
    delivery_item: Mapped[Optional["DeliveryItem"]] = relationship("DeliveryItem", back_populates="assets")
    movements: Mapped[List["AssetMovement"]] = relationship("AssetMovement", back_populates="asset", cascade="all, delete-orphan")
    logs: Mapped[List["AssetLog"]] = relationship("AssetLog", back_populates="asset", cascade="all, delete-orphan")


class AssetMovement(Base):
    """Append-only movement log."""
    __tablename__ = "asset_movements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"), nullable=False)
    from_building: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    from_room: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    to_building: Mapped[str] = mapped_column(String(100), nullable=False)
    to_room: Mapped[str] = mapped_column(String(100), nullable=False)
    moved_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    moved_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    asset: Mapped[Asset] = relationship("Asset", back_populates="movements")
    moved_by: Mapped["User"] = relationship("User")  # type: ignore


class AssetLog(Base):
    """Append-only audit trail for all asset actions."""
    __tablename__ = "asset_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    performed_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    old_value: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    new_value: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    performed_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    asset: Mapped[Asset] = relationship("Asset", back_populates="logs")
    performed_by: Mapped["User"] = relationship("User")  # type: ignore
