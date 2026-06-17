import pytest
from datetime import datetime
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.asset import Asset, AssetLog
from app.models.user import User, Department
from app.services.asset_service import AssetService
from app.routers.assets import (
    register_asset,
    update_asset,
    verify_asset,
    get_dashboard_stats,
    import_assets
)

@pytest.mark.asyncio
async def test_manual_asset_creation_with_extra_fields(db_session):
    """Test registering an asset with Remarks and Asset Source fields."""
    db_session.commit = db_session.flush

    # Retrieve HOD user
    user_q = await db_session.execute(
        select(User).options(selectinload(User.role)).where(User.email == "hod.cse@nitt.edu")
    )
    hod_user = user_q.scalar_one()

    # Manual registration payload
    body = {
        "name": "Supercomputer node",
        "legacy_asset_tag": "LEG-CSE-NODE-01",
        "category": "computer",
        "department_id": hod_user.department_id,
        "year": "2026",
        "remarks": "Purchased from research grant",
        "asset_source": "iris",
        "unit_cost": "150000"
    }

    response = await register_asset(body, db=db_session, user=hod_user)
    assert response["message"] == "Asset manually registered successfully"
    asset_id = response["id"]

    # Verify database entry
    res = await db_session.execute(select(Asset).where(Asset.id == asset_id))
    asset = res.scalar_one()
    assert asset.name == "Supercomputer node"
    assert asset.remarks == "Purchased from research grant"
    assert asset.asset_source == "iris"
    assert asset.unit_cost == 150000.0
    assert asset.is_verified is False

    # Check that registration log is written
    log_q = await db_session.execute(select(AssetLog).where(AssetLog.asset_id == asset_id))
    logs = log_q.scalars().all()
    assert len(logs) == 1
    assert logs[0].action == "asset_registered"
    assert logs[0].new_value["remarks"] == "Purchased from research grant"
    assert logs[0].new_value["asset_source"] == "iris"


@pytest.mark.asyncio
async def test_asset_update_and_audit_log(db_session):
    """Test updating fields on an existing asset and ensuring audit logs capture old and new values."""
    db_session.commit = db_session.flush

    user_q = await db_session.execute(
        select(User).options(selectinload(User.role)).where(User.email == "hod.cse@nitt.edu")
    )
    hod_user = user_q.scalar_one()

    # Create initial asset
    svc = AssetService(db_session)
    asset = await svc.register_asset({
        "name": "Projector B1",
        "legacy_asset_tag": "LEG-PROJ-B1",
        "category": "lab_equipment",
        "department_id": hod_user.department_id,
        "year": "2026",
        "remarks": "Old remarks"
    }, hod_user)
    await db_session.flush()

    # Update asset fields
    update_body = {
        "name": "Projector B1 Updated",
        "remarks": "New remarks",
        "building": "CSE Annex",
        "room": "Seminar Hall",
        "unit_cost": 45000.0
    }

    res = await update_asset(asset.id, update_body, db=db_session, user=hod_user)
    assert res["message"] == "Asset updated successfully"

    # Refresh and check values
    await db_session.refresh(asset)
    assert asset.name == "Projector B1 Updated"
    assert asset.remarks == "New remarks"
    assert asset.building == "CSE Annex"
    assert asset.room == "Seminar Hall"
    assert asset.unit_cost == 45000.0

    # Verify log entry
    log_q = await db_session.execute(
        select(AssetLog)
        .where(AssetLog.asset_id == asset.id, AssetLog.action == "asset_updated")
    )
    log = log_q.scalar_one()
    assert log.old_value["remarks"] == "Old remarks"
    assert log.new_value["remarks"] == "New remarks"
    assert log.new_value["building"] == "CSE Annex"


@pytest.mark.asyncio
async def test_asset_verification_and_audit_log(db_session):
    """Test physical asset verification and verification logging."""
    db_session.commit = db_session.flush

    user_q = await db_session.execute(
        select(User).options(selectinload(User.role)).where(User.email == "hod.cse@nitt.edu")
    )
    hod_user = user_q.scalar_one()

    svc = AssetService(db_session)
    asset = await svc.register_asset({
        "name": "Lab Desk 12",
        "legacy_asset_tag": "LEG-DESK-12",
        "category": "furniture",
        "department_id": hod_user.department_id,
        "year": "2026"
    }, hod_user)
    await db_session.flush()

    assert asset.is_verified is False
    assert asset.verified_at is None

    # Verify the asset
    res = await verify_asset(asset.id, db=db_session, user=hod_user)
    assert res["is_verified"] is True

    # Check updated fields
    await db_session.refresh(asset)
    assert asset.is_verified is True
    assert asset.verified_at is not None

    # Check audit log
    log_q = await db_session.execute(
        select(AssetLog)
        .where(AssetLog.asset_id == asset.id, AssetLog.action == "asset_verified")
    )
    log = log_q.scalar_one()
    assert log.old_value["is_verified"] is False
    assert log.new_value["is_verified"] is True


@pytest.mark.asyncio
async def test_csv_import_atomicity_and_remarks(db_session):
    """Test that CSV import correctly parses the new schema and is fully atomic (rolls back on failure)."""
    db_session.commit = db_session.flush

    user_q = await db_session.execute(
        select(User).options(selectinload(User.role)).where(User.email == "hod.cse@nitt.edu")
    )
    hod_user = user_q.scalar_one()

    svc = AssetService(db_session)

    # 1. Valid CSV content
    valid_csv = (
        "Asset Tag,Asset Name,Category,Department,Building,Room,Custodian,Purchase Year,Condition,Remarks\n"
        "CSV-TAG-01,Workstation Pro,computer,CSE,CSE Block,Lab 1,Dr. Kumar,2026,working,Imported via script\n"
        "CSV-TAG-02,Lecture Chair,furniture,CSE,CSE Block,LHC-2,Dr. Kumar,2026,working,Classroom standard\n"
    )

    res = await svc.import_assets_csv(valid_csv, hod_user)
    assert "Successfully imported 2 assets" in res["message"]

    # Verify entries in DB
    asset1_q = await db_session.execute(select(Asset).where(Asset.legacy_asset_tag == "CSV-TAG-01"))
    asset1 = asset1_q.scalar_one()
    assert asset1.name == "Workstation Pro"
    assert asset1.remarks == "Imported via script"
    assert asset1.asset_source == "legacy"

    # 2. Invalid CSV (duplicate legacy tag on the second row to trigger a validation failure)
    invalid_csv = (
        "Asset Tag,Asset Name,Category,Department,Building,Room,Custodian,Purchase Year,Condition,Remarks\n"
        "CSV-TAG-03,Unique Asset,computer,CSE,CSE Block,Lab 1,Dr. Kumar,2026,working,Should not save\n"
        "CSV-TAG-01,Duplicate Tag Asset,computer,CSE,CSE Block,Lab 1,Dr. Kumar,2026,working,Will cause rollback\n"
    )

    with pytest.raises(HTTPException) as exc_info:
        await svc.import_assets_csv(invalid_csv, hod_user)

    assert exc_info.value.status_code == 400
    # The transaction must have rolled back. Check that CSV-TAG-03 was NOT saved using a clean session.
    from app.core.database import AsyncSessionLocal
    async with AsyncSessionLocal() as check_session:
        check_q = await check_session.execute(select(Asset).where(Asset.legacy_asset_tag == "CSV-TAG-03"))
        assert check_q.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_dashboard_stats(db_session):
    """Test dashboard stats endpoint calculation for department users."""
    db_session.commit = db_session.flush

    user_q = await db_session.execute(
        select(User).options(selectinload(User.role)).where(User.email == "hod.cse@nitt.edu")
    )
    hod_user = user_q.scalar_one()

    # Clear existing assets for CSE department to have a clean starting point
    from app.models.asset import Asset
    await db_session.execute(
        select(Asset).where(Asset.department_id == hod_user.department_id)
    )
    
    # Register 3 assets: 2 verified, 1 pending; distinct conditions & categories
    svc = AssetService(db_session)
    a1 = await svc.register_asset({
        "name": "PC 1",
        "legacy_asset_tag": "CSE-STAT-PC1",
        "category": "computer",
        "condition": "working",
        "department_id": hod_user.department_id,
        "year": "2026"
    }, hod_user)
    a2 = await svc.register_asset({
        "name": "PC 2",
        "legacy_asset_tag": "CSE-STAT-PC2",
        "category": "computer",
        "condition": "damaged",
        "department_id": hod_user.department_id,
        "year": "2026"
    }, hod_user)
    a3 = await svc.register_asset({
        "name": "Table 1",
        "legacy_asset_tag": "CSE-STAT-TB1",
        "category": "furniture",
        "condition": "working",
        "department_id": hod_user.department_id,
        "year": "2026"
    }, hod_user)
    
    await db_session.flush()

    # Verify a1 and a3
    a1.is_verified = True
    a3.is_verified = True
    await db_session.flush()

    # Fetch stats
    stats = await get_dashboard_stats(db=db_session, user=hod_user)
    
    # Assert values
    assert stats["total_assets"] >= 3
    assert stats["pending_verification"] >= 1
    assert stats["by_category"].get("computer") >= 2
    assert stats["by_category"].get("furniture") >= 1
    assert stats["by_condition"].get("working") >= 2
    assert stats["by_condition"].get("damaged") >= 1
    assert len(stats["recent_assets"]) <= 5


@pytest.mark.asyncio
async def test_manual_asset_creation_with_quantity_and_supplier_fields(db_session):
    """Test registering multiple assets at once with supplier, bill, and stock register metadata."""
    db_session.commit = db_session.flush

    user_q = await db_session.execute(
        select(User).options(selectinload(User.role)).where(User.email == "hod.cse@nitt.edu")
    )
    hod_user = user_q.scalar_one()

    # Manual registration payload with quantity > 1
    body = {
        "name": "HP EliteOne G9 AIO PC",
        "legacy_asset_tag": "HP-AIO-LEGACY",
        "category": "computer",
        "department_id": hod_user.department_id,
        "year": "2026",
        "quantity": 3,
        "supplier_name": "M/s. USAM TECHNOLOGY SOLUTIONS",
        "supplier_address": "123, Tech Park, Chennai",
        "bill_number": "200058/TRY2526",
        "bill_date": "2026-04-21",
        "stock_register_volume": "4",
        "stock_register_page": "67",
        "delivery_date": "2026-04-21",
        "remarks": "Lab upgrade batch"
    }

    response = await register_asset(body, db=db_session, user=hod_user)
    assert response["message"] == "Asset manually registered successfully"
    
    # Check that 3 assets were created in the database
    # The tags generated should have sequence increments, and legacy tags should be suffixed with index
    res = await db_session.execute(
        select(Asset)
        .where(Asset.supplier_name == "M/s. USAM TECHNOLOGY SOLUTIONS")
        .order_by(Asset.asset_tag.asc())
    )
    assets = res.scalars().all()
    assert len(assets) == 3
    
    # Check details of the assets
    for idx, asset in enumerate(assets):
        assert asset.name == "HP EliteOne G9 AIO PC"
        assert asset.category == "computer"
        assert asset.legacy_asset_tag == f"HP-AIO-LEGACY-{idx+1}"
        assert asset.supplier_address == "123, Tech Park, Chennai"
        assert asset.bill_number == "200058/TRY2526"
        assert asset.bill_date.isoformat() == "2026-04-21"
        assert asset.delivery_date.isoformat() == "2026-04-21"
        assert asset.stock_register_volume == "4"
        assert asset.stock_register_page == "67"
        assert asset.remarks == "Lab upgrade batch"


@pytest.mark.asyncio
async def test_public_qr_profile_returns_all_details(db_session):
    """Test that public_asset_profile returns all required metadata for physical scans."""
    from app.routers.assets import public_asset_profile
    from app.models.asset import AssetCondition

    # Retrieve HOD user
    user_q = await db_session.execute(
        select(User).options(selectinload(User.role)).where(User.email == "hod.cse@nitt.edu")
    )
    hod_user = user_q.scalar_one()

    # Create an asset with full metadata
    svc = AssetService(db_session)
    asset = await svc.register_asset({
        "name": "Audit Scanner",
        "legacy_asset_tag": "LEG-AUDIT-SCAN-99",
        "category": "lab_equipment",
        "department_id": hod_user.department_id,
        "year": "2026",
        "building": "Main Admin",
        "room": "Stores room",
        "custodian": "Mr. Storekeeper",
        "serial_number": "SN-AUDIT-9999",
        "fund_source": "plan_fund",
        "remarks": "For scanner testing"
    }, hod_user)
    asset.purchase_date = datetime.strptime("2026-05-10", "%Y-%m-%d").date()
    asset.warranty_expiry = datetime.strptime("2028-05-10", "%Y-%m-%d").date()
    await db_session.flush()

    # Call the public QR profile endpoint
    res = await public_asset_profile(asset.asset_tag, db=db_session)

    # Check that all details are returned
    assert res["asset_tag"] == asset.asset_tag
    assert res["asset_name"] == "Audit Scanner"
    assert res["location"] == "Main Admin Stores room"
    assert res["custodian_name"] == "Mr. Storekeeper"
    assert res["category"] == "lab_equipment"
    assert res["legacy_asset_tag"] == "LEG-AUDIT-SCAN-99"
    assert res["fund_source"] == "plan_fund"
    assert res["condition"] == AssetCondition.WORKING
    assert res["building"] == "Main Admin"
    assert res["room"] == "Stores room"
    assert res["custodian"] == "Mr. Storekeeper"
    assert res["serial_number"] == "SN-AUDIT-9999"
    assert res["purchase_date"].isoformat() == "2026-05-10"
    assert res["warranty_expiry"].isoformat() == "2028-05-10"

