from __future__ import annotations
from datetime import datetime, date
from typing import Optional, List, TYPE_CHECKING
from sqlalchemy import String, Integer, DateTime, Date, Boolean, Float, ForeignKey, func, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import Department
    from app.models.purchase_request import PurchaseRequestItem


class FinancialYear(Base):
    __tablename__ = "financial_years"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    label: Mapped[str] = mapped_column(String(9), nullable=False)  # e.g. "2024-25"
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_closed: Mapped[bool] = mapped_column(Boolean, default=False)

    budget_entries: Mapped[List["BudgetMaster"]] = relationship("BudgetMaster", back_populates="financial_year")


class PurchaseCategory(Base):
    __tablename__ = "purchase_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    min_amount: Mapped[float] = mapped_column(Float, nullable=False)
    max_amount: Mapped[float] = mapped_column(Float, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    procurement_id: Mapped[int] = mapped_column(ForeignKey("procurement_managers.id", ondelete="CASCADE"), nullable=False)
    requirement_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    procurement: Mapped["ProcurementManager"] = relationship("ProcurementManager")



class ProcurementManager(Base):
    __tablename__ = "procurement_managers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    max_amount: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    form_schema: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)


class PhaseManager(Base):
    __tablename__ = "phase_managers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    phase_name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    phase_order: Mapped[int] = mapped_column(Integer, default=0)


class BudgetMaster(Base):
    __tablename__ = "budget_master"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    department_id: Mapped[Optional[int]] = mapped_column(ForeignKey("departments.id"), nullable=True)
    financial_year_id: Mapped[int] = mapped_column(ForeignKey("financial_years.id"), nullable=False)
    expenditure_category: Mapped[str] = mapped_column(String(255), nullable=False)
    item_name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(255), nullable=False)
    course_code: Mapped[str] = mapped_column(String(255), nullable=False)
    unit_cost: Mapped[float] = mapped_column(Float, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    total_allocation: Mapped[float] = mapped_column("total_allocation", Float, nullable=False)
    file_no: Mapped[str] = mapped_column(String(64), nullable=False)
    is_revision: Mapped[bool] = mapped_column(Boolean, default=False)
    # Bug fix: track committed and utilized amounts
    committed_amount: Mapped[float] = mapped_column("committed_amount", Float, default=0.0)
    utilized_amount: Mapped[float] = mapped_column("utilized_amount", Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    expert1_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    expert2_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    director_faculty_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    department: Mapped[Optional["Department"]] = relationship("Department", back_populates="budget_entries")  # type: ignore
    financial_year: Mapped[FinancialYear] = relationship("FinancialYear", back_populates="budget_entries")
    pr_items: Mapped[List["PurchaseRequestItem"]] = relationship("PurchaseRequestItem", back_populates="budget_file")  # type: ignore
    expert1: Mapped[Optional["User"]] = relationship("User", foreign_keys=[expert1_id])  # type: ignore
    expert2: Mapped[Optional["User"]] = relationship("User", foreign_keys=[expert2_id])  # type: ignore
    director_faculty: Mapped[Optional["User"]] = relationship("User", foreign_keys=[director_faculty_id])  # type: ignore

    @property
    def available_balance(self) -> float:
        return self.total_allocation - self.committed_amount - self.utilized_amount

    @property
    def total_cost(self) -> float:
        return self.total_allocation

    @total_cost.setter
    def total_cost(self, value: float) -> None:
        self.total_allocation = value

    @property
    def locked_amount(self) -> float:
        return self.committed_amount

    @locked_amount.setter
    def locked_amount(self, value: float) -> None:
        self.committed_amount = value

    @property
    def deducted_amount(self) -> float:
        return self.utilized_amount

    @deducted_amount.setter
    def deducted_amount(self, value: float) -> None:
        self.utilized_amount = value

    @property
    def available_amount(self) -> float:
        return self.available_balance


class Settings(Base):
    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    key_name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    value: Mapped[str] = mapped_column(String(1024), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), onupdate=func.now())


class TCMaster(Base):
    __tablename__ = "tc_master"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
