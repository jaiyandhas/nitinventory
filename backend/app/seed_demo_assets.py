import asyncio
from datetime import date
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.core.config import settings
from app.models.user import Department, User
from app.models.asset import Asset, DisposalStatus, AssetLog
from app.services.qr_service import QrService

engine = create_async_engine(settings.DATABASE_URL, echo=False)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

async def seed_assets():
    async with SessionLocal() as db:
        # Find CSE department
        dept_q = await db.execute(select(Department).where(Department.short_code == "CSE"))
        cse_dept = dept_q.scalar_one_or_none()
        if not cse_dept:
            print("CSE department not found!")
            return
            
        # Find CSE HOD
        hod_q = await db.execute(select(User).where(User.email == "hod.cse@nitt.edu"))
        hod_user = hod_q.scalar_one_or_none()
        hod_id = hod_user.id if hod_user else 1
        
        # 10 diverse sample assets for CSE with fund_source
        samples = [
            ("Dell Precision 3660 Workstation", "computer", "working", "2023", "CSE-LAB1-001", "Lyceum", "Room 201", "Dr. A. Kumar", "SN-DELL-883A", 125000.0, "2023-06-15", "2026-06-15", "plan_fund"),
            ("HP LaserJet Pro MFP M428fdw", "computer", "working", "2024", "CSE-OFF-002", "Lyceum", "HOD Office", "Prof. D. Rajan", "SN-HP-991A", 42000.0, "2024-02-10", "2027-02-10", "non_plan_fund"),
            ("Steel Ergonomic Office Chair", "furniture", "working", "2023", "CSE-FUR-003", "Lyceum", "Faculty Room 1", "Dr. B. Prasad", "SN-STEEL-003", 8500.0, "2023-08-20", "2025-08-20", "dept_development_fund"),
            ("Modular Lab Bench Table", "furniture", "working", "2023", "CSE-FUR-004", "Lyceum", "Room 202", "Dr. C. Singh", "SN-TAB-004", 18000.0, "2023-08-20", None, "dept_development_fund"),
            ("Nvidia RTX A6000 GPU Node", "computer", "under_repair", "2025", "CSE-GPU-005", "Lyceum", "AI Research Lab", "Dr. A. Kumar", "SN-NV-A6000", 450000.0, "2025-01-15", "2028-01-15", "research_fund"),
            ("Cisco Catalyst 9300 Switch", "lab_equipment", "working", "2024", "CSE-NET-006", "Lyceum", "Server Room", "Mr. K. DA Stores", "SN-CISCO-9300", 250000.0, "2024-05-12", "2029-05-12", "plan_fund"),
            ("Digital Storage Oscilloscope", "lab_equipment", "damaged", "2022", "CSE-LAB2-007", "Lyceum", "Hardware Lab", "Dr. C. Singh", "SN-TEK-7711", 85000.0, "2022-11-05", "2025-11-05", "consultancy_fund"),
            ("Samsung 55\" Interactive Display", "computer", "working", "2024", "CSE-SEM-008", "Lyceum", "Seminar Hall", "Prof. D. Rajan", "SN-SAM-55D", 115000.0, "2024-08-18", "2026-08-18", "plan_fund"),
            ("APC Smart-UPS 5kVA", "lab_equipment", "working", "2023", "CSE-UPS-009", "Lyceum", "Power Room", "Dr. B. Prasad", "SN-APC-5000", 95000.0, "2023-09-30", "2025-09-30", "others"),
            ("Godrej Almirah Steel Cabinet", "furniture", "obsolete", "2020", "CSE-FUR-010", "Lyceum", "Dept Library", "Prof. D. Rajan", "SN-GODREJ-10", 15000.0, "2020-04-10", None, "others"),
        ]
        
        qr_svc = QrService()
        count = 0
        for name, category, cond, year_str, legacy_tag, building, room, custodian, serial, cost, p_date_str, w_date_str, fund in samples:
            # Check if legacy tag already exists, update its fund_source if so
            existing_q = await db.execute(select(Asset).where(Asset.legacy_asset_tag == legacy_tag))
            existing = existing_q.scalar_one_or_none()
            if existing:
                existing.fund_source = fund
                continue
                
            year_suffix = year_str[-2:]
            
            # Find next tag sequence
            seq_q = await db.execute(
                select(Asset).where(Asset.asset_tag.like(f"NIT-CSE-{year_suffix}-%"))
            )
            seq = len(seq_q.scalars().all()) + 1
            asset_tag = f"NIT-CSE-{year_suffix}-{seq:03d}"
            
            qr_url = qr_svc.generate(asset_tag)
            
            p_date = date.fromisoformat(p_date_str) if p_date_str else None
            w_date = date.fromisoformat(w_date_str) if w_date_str else None
            
            asset = Asset(
                asset_tag=asset_tag,
                legacy_asset_tag=legacy_tag,
                fund_source=fund,
                name=name,
                category=category,
                department_id=cse_dept.id,
                building=building,
                room=room,
                custodian=custodian,
                serial_number=serial,
                condition=cond,
                disposal_status=DisposalStatus.ACTIVE,
                qr_code_url=qr_url,
                purchase_date=p_date,
                unit_cost=cost,
                warranty_expiry=w_date,
            )
            db.add(asset)
            await db.flush()
            
            # Log creation
            log = AssetLog(
                asset_id=asset.id,
                action="asset_registered",
                performed_by_id=hod_id,
                old_value=None,
                new_value={
                    "asset_tag": asset_tag,
                    "legacy_asset_tag": legacy_tag,
                    "fund_source": fund,
                    "condition": cond
                }
            )
            db.add(log)
            count += 1
            
        await db.commit()
        print(f"✓ Seeded/Updated {count} sample assets in CSE department.")

if __name__ == "__main__":
    asyncio.run(seed_assets())
