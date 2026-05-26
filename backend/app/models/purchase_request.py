from __future__ import annotations
from datetime import datetime, date
from typing import Optional, List, TYPE_CHECKING
from sqlalchemy import (
    String, Integer, DateTime, Date, Boolean, Float,
    ForeignKey, func, Text, JSON, Enum as SAEnum
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
import enum

if TYPE_CHECKING:
    from app.models.user import User, Department, RoleManager
    from app.models.budget import BudgetMaster, PurchaseCategory, FinancialYear, ProcurementManager, PhaseManager


class RequestStatus(str, enum.Enum):
    PR_SUBMITTED = "pr_submitted"
    IN_PROGRESS = "in_progress"
    SENT_BACK = "sent_back"
    REJECTED = "rejected"
    PO_ISSUED = "po_issued"
    CANCELLED = "cancelled"
    COMPLETED = "completed"


class PurchaseType(str, enum.Enum):
    DEPARTMENT = "department"
    OFFICE = "office"


class AssignmentStatus(str, enum.Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class PurchaseRequest(Base):
    __tablename__ = "purchase_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    icr_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, unique=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("purchase_categories.id"), nullable=False)
    financial_year_id: Mapped[int] = mapped_column(ForeignKey("financial_years.id"), nullable=False)
    initiator_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    nominee_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    procurement_id: Mapped[int] = mapped_column(ForeignKey("procurement_managers.id"), nullable=False)

    purchase_type: Mapped[str] = mapped_column(String(50), nullable=False)
    current_status: Mapped[str] = mapped_column(String(50), default=RequestStatus.PR_SUBMITTED)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    emd: Mapped[float] = mapped_column(Float, default=0.0)
    performance_security: Mapped[float] = mapped_column(Float, default=0.0)
    vendor_list_link: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    is_item_split: Mapped[bool] = mapped_column(Boolean, default=False)
    item_split_justification: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_quantity_split: Mapped[bool] = mapped_column(Boolean, default=False)
    quantity_split_details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_service_center_in_south: Mapped[bool] = mapped_column(Boolean, default=False)
    service_center_south_desc: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    basis_of_estimate_details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    delivery_mode: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    delivery_location: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    exemption: Mapped[bool] = mapped_column(Boolean, default=False)
    exemption_remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_training_required: Mapped[bool] = mapped_column(Boolean, default=False)
    training_type: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    training_vendor: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    training_comments: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    tender_reference_number: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    date_of_tender: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    date_of_tech_bid_opening: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    date_of_financial_bid_opening: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    aa_approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    te_initiated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    te_approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    fs_initiated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    fs_approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    po_initiated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    po_approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    faculty1_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    faculty2_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    faculty3_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    aa_approver_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    # Relationships
    purchase_category: Mapped["PurchaseCategory"] = relationship("PurchaseCategory", foreign_keys=[category_id])  # type: ignore
    financial_year: Mapped["FinancialYear"] = relationship("FinancialYear", foreign_keys=[financial_year_id])  # type: ignore
    initiator: Mapped["User"] = relationship("User", foreign_keys=[initiator_id])  # type: ignore
    nominee: Mapped[Optional["User"]] = relationship("User", foreign_keys=[nominee_id])  # type: ignore
    procurement: Mapped["ProcurementManager"] = relationship("ProcurementManager", foreign_keys=[procurement_id])  # type: ignore
    faculty1: Mapped[Optional["User"]] = relationship("User", foreign_keys=[faculty1_id])  # type: ignore
    faculty2: Mapped[Optional["User"]] = relationship("User", foreign_keys=[faculty2_id])  # type: ignore
    faculty3: Mapped[Optional["User"]] = relationship("User", foreign_keys=[faculty3_id])  # type: ignore
    aa_approver: Mapped[Optional["User"]] = relationship("User", foreign_keys=[aa_approver_id])  # type: ignore
    items: Mapped[List["PurchaseRequestItem"]] = relationship("PurchaseRequestItem", back_populates="purchase_request", cascade="all, delete-orphan")
    history: Mapped[List["PurchaseRequestHistory"]] = relationship("PurchaseRequestHistory", back_populates="purchase_request", cascade="all, delete-orphan")
    flow: Mapped[Optional["PurchaseRequestFlow"]] = relationship("PurchaseRequestFlow", back_populates="purchase_request", uselist=False, cascade="all, delete-orphan")
    assignments: Mapped[List["PurchaseRequestAssignment"]] = relationship("PurchaseRequestAssignment", back_populates="purchase_request", cascade="all, delete-orphan")
    technical_evaluations: Mapped[List["TechnicalEvaluation"]] = relationship("TechnicalEvaluation", back_populates="purchase_request", cascade="all, delete-orphan")
    financial_evaluations: Mapped[List["FinancialEvaluation"]] = relationship("FinancialEvaluation", back_populates="purchase_request", cascade="all, delete-orphan")
    commercial_evaluations: Mapped[List["CommercialEvaluation"]] = relationship("CommercialEvaluation", back_populates="purchase_request", cascade="all, delete-orphan")
    documents: Mapped[List["Document"]] = relationship("Document", back_populates="purchase_request", cascade="all, delete-orphan")


class PurchaseRequestItem(Base):
    __tablename__ = "purchase_request_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    purchase_request_id: Mapped[int] = mapped_column(ForeignKey("purchase_requests.id"), nullable=False)
    budget_file_id: Mapped[int] = mapped_column(ForeignKey("budget_master.id"), nullable=False)
    item_description: Mapped[str] = mapped_column(String(500), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    estimated_total: Mapped[float] = mapped_column(Float, nullable=False)
    charges: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    requirement_type: Mapped[str] = mapped_column(String(100), nullable=False)
    availability: Mapped[str] = mapped_column(String(100), nullable=False)
    availability_remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    site_readiness: Mapped[bool] = mapped_column(Boolean, nullable=False)
    site_readiness_remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    warranty: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    delivery_period: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    present_stock: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    justification_for_procurement: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    previous_file_no_reference: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    installation_required: Mapped[bool] = mapped_column(Boolean, default=False)
    tech_specs_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    gem_link: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    purchase_request: Mapped[PurchaseRequest] = relationship("PurchaseRequest", back_populates="items")
    budget_file: Mapped["BudgetMaster"] = relationship("BudgetMaster", back_populates="pr_items")  # type: ignore


class PurchaseRequestFlow(Base):
    __tablename__ = "purchase_request_flows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    purchase_request_id: Mapped[int] = mapped_column(ForeignKey("purchase_requests.id"), nullable=False, unique=True)
    phase_id: Mapped[int] = mapped_column(ForeignKey("phase_managers.id"), nullable=False)
    step_order: Mapped[int] = mapped_column(Integer, nullable=False)
    rejected: Mapped[bool] = mapped_column(Boolean, default=False)

    purchase_request: Mapped[PurchaseRequest] = relationship("PurchaseRequest", back_populates="flow")
    phase: Mapped["PhaseManager"] = relationship("PhaseManager")  # type: ignore


class PurchaseRequestHistory(Base):
    __tablename__ = "purchase_request_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    purchase_request_id: Mapped[int] = mapped_column(ForeignKey("purchase_requests.id"), nullable=False)
    current_approver_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(255), nullable=False)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    acted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    purchase_request: Mapped[PurchaseRequest] = relationship("PurchaseRequest", back_populates="history")
    current_approver: Mapped[Optional["User"]] = relationship("User")  # type: ignore


class PurchaseRequestAssignment(Base):
    __tablename__ = "purchase_request_assignments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    purchase_request_id: Mapped[int] = mapped_column(ForeignKey("purchase_requests.id"), nullable=False)
    assigned_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    assigned_da_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default=AssignmentStatus.PENDING)
    assigned_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    purchase_request: Mapped[PurchaseRequest] = relationship("PurchaseRequest", back_populates="assignments")
    assigned_by: Mapped["User"] = relationship("User", foreign_keys=[assigned_by_id])  # type: ignore
    assigned_da: Mapped["User"] = relationship("User", foreign_keys=[assigned_da_id])  # type: ignore


class TechnicalEvaluation(Base):
    __tablename__ = "technical_evaluations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    purchase_request_id: Mapped[int] = mapped_column(ForeignKey("purchase_requests.id"), nullable=False)
    vendor_name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_qualified: Mapped[bool] = mapped_column(Boolean, nullable=False)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    purchase_request: Mapped[PurchaseRequest] = relationship("PurchaseRequest", back_populates="technical_evaluations")


class FinancialEvaluation(Base):
    __tablename__ = "financial_evaluations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    purchase_request_id: Mapped[int] = mapped_column(ForeignKey("purchase_requests.id"), nullable=False)
    vendor_name: Mapped[str] = mapped_column(String(255), nullable=False)
    quoted_amount: Mapped[float] = mapped_column(Float, nullable=False)
    ranking: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    is_awarded: Mapped[bool] = mapped_column(Boolean, default=False)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    purchase_request: Mapped[PurchaseRequest] = relationship("PurchaseRequest", back_populates="financial_evaluations")


class CommercialEvaluation(Base):
    __tablename__ = "commercial_evaluations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    purchase_request_id: Mapped[int] = mapped_column(ForeignKey("purchase_requests.id"), nullable=False)
    vendor_name: Mapped[str] = mapped_column(String(255), nullable=False)
    vendor_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    quoted_amount: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_qualified: Mapped[bool] = mapped_column(Boolean, nullable=False)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    purchase_request: Mapped[PurchaseRequest] = relationship("PurchaseRequest", back_populates="commercial_evaluations")


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    purchase_request_id: Mapped[int] = mapped_column(ForeignKey("purchase_requests.id"), nullable=False)
    doc_key: Mapped[str] = mapped_column(String(255), nullable=False)
    doc_value: Mapped[dict] = mapped_column(JSON, nullable=False)
    uploaded_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), onupdate=func.now())

    purchase_request: Mapped[PurchaseRequest] = relationship("PurchaseRequest", back_populates="documents")
    uploaded_by: Mapped[Optional["User"]] = relationship("User")  # type: ignore


class WorkFlowHierarchy(Base):
    __tablename__ = "workflow_hierarchies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("purchase_categories.id", ondelete="CASCADE"), nullable=False)
    phase_id: Mapped[int] = mapped_column(ForeignKey("phase_managers.id"), nullable=False)
    procurement_id: Mapped[int] = mapped_column(ForeignKey("procurement_managers.id", ondelete="CASCADE"), nullable=False)
    step_order: Mapped[int] = mapped_column(Integer, nullable=False)
    user_type: Mapped[str] = mapped_column(String(255), nullable=False)
    user_group: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    role_id: Mapped[Optional[int]] = mapped_column(ForeignKey("role_managers.id"), nullable=True)
    purchase_type: Mapped[str] = mapped_column(String(100), nullable=False)

    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    user: Mapped[Optional["User"]] = relationship("User")  # type: ignore
    role: Mapped[Optional["RoleManager"]] = relationship("RoleManager")  # type: ignore
    category: Mapped["PurchaseCategory"] = relationship("PurchaseCategory")  # type: ignore
    phase: Mapped["PhaseManager"] = relationship("PhaseManager")  # type: ignore
    procurement: Mapped["ProcurementManager"] = relationship("ProcurementManager")  # type: ignore


class VendorMaster(Base):
    __tablename__ = "vendor_master"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vendor_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    contact_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    pincode: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    gst_number: Mapped[Optional[str]] = mapped_column(String(15), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())


class EmailQueue(Base):
    __tablename__ = "email_queue"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    recipient: Mapped[str] = mapped_column(String(255), nullable=False)
    attachments: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    sent: Mapped[bool] = mapped_column(Boolean, default=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

