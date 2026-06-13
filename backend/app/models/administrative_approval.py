from __future__ import annotations
from datetime import datetime
from typing import Optional, List, TYPE_CHECKING
from sqlalchemy import String, Integer, DateTime, Float, ForeignKey, func, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User, RoleManager
    from app.models.budget import BudgetMaster


class AdministrativeApproval(Base):
    __tablename__ = "administrative_approvals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    aa_number: Mapped[Optional[str]] = mapped_column(String(100), unique=True, nullable=True)
    
    budget_file_id: Mapped[int] = mapped_column(ForeignKey("budget_master.id"), nullable=False)
    pi_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    item_description: Mapped[str] = mapped_column(Text, nullable=False)
    gst_rate: Mapped[float] = mapped_column(Float, nullable=False)  # entered as percentage, e.g. 18.0
    mode_of_procurement: Mapped[str] = mapped_column(String(100), nullable=False)
    justification: Mapped[str] = mapped_column(Text, nullable=False)
    
    gst_amount: Mapped[float] = mapped_column(Float, nullable=False)
    total_cost: Mapped[float] = mapped_column(Float, nullable=False)
    
    status: Mapped[str] = mapped_column(String(100), default="Submitted to HOD")
    pending_with: Mapped[Optional[str]] = mapped_column(String(50), nullable=True) # "HOD", "ADPD", "Director", or None
    attachment_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    
    item_category: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    stock_availability: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    present_stock: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    prev_file_no: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    justification_procurement: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    basis_of_estimation_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    gem_non_availability_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    authority_approval_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    pac_dept_cert_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    pac_vendor_cert_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    generic_specification_declaration: Mapped[bool] = mapped_column(Boolean, default=False, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    
    # Relationships
    budget_file: Mapped["BudgetMaster"] = relationship("BudgetMaster")
    pi: Mapped["User"] = relationship("User")
    history: Mapped[List["AdministrativeApprovalHistory"]] = relationship(
        "AdministrativeApprovalHistory", back_populates="approval", cascade="all, delete-orphan"
    )
    nominees: Mapped[List["AdministrativeApprovalNominee"]] = relationship(
        "AdministrativeApprovalNominee", back_populates="approval", cascade="all, delete-orphan", passive_deletes=True
    )


class AdministrativeApprovalNominee(Base):
    __tablename__ = "administrative_approval_nominees"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    approval_id: Mapped[int] = mapped_column(ForeignKey("administrative_approvals.id", ondelete="CASCADE"), nullable=False)
    nominee_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    step_order: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(String(50), default="Pending")
    acted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    approval: Mapped["AdministrativeApproval"] = relationship("AdministrativeApproval", back_populates="nominees")
    nominee: Mapped["User"] = relationship("User")


class AdministrativeApprovalHistory(Base):
    __tablename__ = "administrative_approval_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    approval_id: Mapped[int] = mapped_column(ForeignKey("administrative_approvals.id"), nullable=False)
    
    approver_role: Mapped[str] = mapped_column(String(50), nullable=False)  # "HOD", "ADPD", "Director"
    approver_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    
    status: Mapped[str] = mapped_column(String(100), nullable=False)  # "Approved", "Returned", "Rejected"
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    acted_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    
    # Relationships
    approval: Mapped["AdministrativeApproval"] = relationship("AdministrativeApproval", back_populates="history")
    approver: Mapped["User"] = relationship("User")


class AdministrativeApprovalWorkflow(Base):
    __tablename__ = "administrative_approval_workflows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    category_id: Mapped[Optional[int]] = mapped_column(ForeignKey("purchase_categories.id", ondelete="CASCADE"), nullable=True)
    procurement_id: Mapped[Optional[int]] = mapped_column(ForeignKey("procurement_managers.id", ondelete="CASCADE"), nullable=True)
    purchase_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    step_order: Mapped[int] = mapped_column(Integer, nullable=False)
    role_id: Mapped[Optional[int]] = mapped_column(ForeignKey("role_managers.id"), nullable=True)
    user_group: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    skip_condition: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Relationships
    role: Mapped[Optional["RoleManager"]] = relationship("RoleManager")
