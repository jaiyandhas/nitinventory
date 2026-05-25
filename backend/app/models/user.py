from __future__ import annotations
from datetime import datetime
from typing import Optional, List, TYPE_CHECKING
from sqlalchemy import String, Integer, DateTime, Boolean, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base

if TYPE_CHECKING:
    from app.models.purchase_request import PurchaseRequest
    from app.models.asset import Asset


class Department(Base):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    short_code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)

    users: Mapped[List["User"]] = relationship("User", back_populates="department")
    budget_entries: Mapped[List["BudgetMaster"]] = relationship("BudgetMaster", back_populates="department")  # type: ignore
    assets: Mapped[List["Asset"]] = relationship("Asset", back_populates="department")


class RoleManager(Base):
    __tablename__ = "role_managers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    value: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    group_key: Mapped[str] = mapped_column(String(50), nullable=False)

    users: Mapped[List["User"]] = relationship("User", back_populates="role")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    designation: Mapped[str] = mapped_column(String(255), nullable=False)
    gender: Mapped[str] = mapped_column(String(20), nullable=False)
    role_id: Mapped[Optional[int]] = mapped_column(ForeignKey("role_managers.id"), nullable=True)
    department_id: Mapped[Optional[int]] = mapped_column(ForeignKey("departments.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    signature_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    is_approved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    role: Mapped[Optional[RoleManager]] = relationship("RoleManager", back_populates="users")
    department: Mapped[Optional[Department]] = relationship("Department", back_populates="users")
