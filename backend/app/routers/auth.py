from fastapi import APIRouter, Depends, HTTPException, Response, Request, status, Form, File, UploadFile
from datetime import datetime
from typing import Optional
import os
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import verify_password, create_access_token, set_auth_cookie, clear_auth_cookie, get_password_hash
from app.core.deps import get_current_user
from app.models.user import User, RoleManager, Department
from app.models.budget import Settings
from app.core.config import settings
from app.core.limiter import limiter

router = APIRouter(prefix="/api/auth", tags=["auth"])


def process_signature_image(content: bytes) -> bytes:
    """Process uploaded signature image to make the white background transparent with smooth anti-aliased edges."""
    from PIL import Image
    import io
    try:
        img = Image.open(io.BytesIO(content))
        img = img.convert("RGBA")
        datas = img.getdata()
        
        new_data = []
        for item in datas:
            r, g, b, a = item
            # Calculate average intensity
            brightness = (r + g + b) // 3
            if brightness >= 240:
                new_data.append((r, g, b, 0))
            elif brightness <= 180:
                new_data.append(item)
            else:
                # Interpolate alpha smoothly between 180 and 240
                factor = (240 - brightness) / 60.0
                new_alpha = int(a * factor)
                new_data.append((r, g, b, new_alpha))
                
        img.putdata(new_data)
        out_io = io.BytesIO()
        img.save(out_io, format="PNG")
        return out_io.getvalue()
    except Exception:
        return content


@router.get("/departments")
async def public_departments(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Department).order_by(Department.name))
    depts = result.scalars().all()
    return [{"id": d.id, "name": d.name, "short_code": d.short_code} for d in depts]


@router.get("/roles")
async def public_roles(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RoleManager).order_by(RoleManager.name))
    roles = result.scalars().all()
    return [{"id": r.id, "name": r.name, "value": r.value, "group_key": r.group_key} for r in roles]


@router.get("/designations")
async def public_designations(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Settings).where(Settings.key_name == "designations"))
    setting = result.scalar_one_or_none()
    if setting:
        return [d.strip() for d in setting.value.split(",") if d.strip()]
    return ["Assistant Professor", "Associate Professor", "Professor", "Dean P&D (Budget)", "Dean P&D", "Director", "Registrar"]


@router.post("/register")
@limiter.limit("20/minute")
async def register(
    request: Request,
    name: str = Form(...),
    email: str = Form(...),
    password: str = Form(...),
    designation: str = Form(...),
    gender: str = Form(...),
    department_id: int = Form(...),
    title: Optional[str] = Form("Mr."),
    signature: Optional[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db)
):
    email = email.strip().lower()
    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")
        
    role_res = await db.execute(select(RoleManager).where(RoleManager.value == "pending_faculty"))
    role = role_res.scalar_one_or_none()
    if not role:
        role = RoleManager(name="Pending Faculty", value="pending_faculty", group_key="faculty")
        db.add(role)
        await db.flush()
        
    dept_res = await db.execute(select(Department).where(Department.id == department_id))
    dept = dept_res.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=400, detail="Invalid department selected")

    user = User(
        title=title,
        name=name,
        email=email,
        hashed_password=get_password_hash(password),
        designation=designation,
        gender=gender,
        role_id=role.id,
        department_id=department_id,
        is_active=True,
        is_approved=False,
    )
    db.add(user)
    await db.flush()

    if signature:
        os.makedirs(os.path.join(settings.STORAGE_PATH, "signatures"), exist_ok=True)
        base_name, _ = os.path.splitext(signature.filename)
        filename = f"{user.id}_{uuid.uuid4().hex}_{base_name}.png"
        file_path = os.path.join("signatures", filename)
        abs_path = os.path.join(settings.STORAGE_PATH, file_path)
        content = await signature.read()
        processed_content = process_signature_image(content)
        with open(abs_path, "wb") as f:
            f.write(processed_content)
        user.signature_path = file_path

    await db.commit()
    return {"message": "Registration successful. Pending administrator approval.", "id": user.id}


@router.post("/profile")
async def update_profile(
    name: str = Form(...),
    designation: str = Form(...),
    gender: str = Form(...),
    title: Optional[str] = Form("Mr."),
    signature: Optional[UploadFile] = File(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user.name = name
    user.designation = designation
    user.gender = gender
    user.title = title

    if signature:
        os.makedirs(os.path.join(settings.STORAGE_PATH, "signatures"), exist_ok=True)
        if user.signature_path:
            old_abs = os.path.join(settings.STORAGE_PATH, user.signature_path)
            if os.path.exists(old_abs):
                try:
                    os.remove(old_abs)
                except Exception:
                    pass
        base_name, _ = os.path.splitext(signature.filename)
        filename = f"{user.id}_{uuid.uuid4().hex}_{base_name}.png"
        file_path = os.path.join("signatures", filename)
        abs_path = os.path.join(settings.STORAGE_PATH, file_path)
        content = await signature.read()
        processed_content = process_signature_image(content)
        with open(abs_path, "wb") as f:
            f.write(processed_content)
        user.signature_path = file_path

    await db.commit()
    return {
        "message": "Profile updated successfully",
        "id": user.id,
        "title": user.title,
        "name": user.name,
        "email": user.email,
        "designation": user.designation,
        "gender": user.gender,
        "is_approved": user.is_approved,
        "signature_path": f"/storage/{user.signature_path}" if user.signature_path else None,
    }


@router.post("/login")
@limiter.limit("30/minute")
async def login(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    data = await request.json()
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    result = await db.execute(
        select(User)
        .options(selectinload(User.role), selectinload(User.department))
        .where(User.email == email)
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is inactive")

    user.last_login_at = datetime.utcnow()
    await db.commit()

    token = create_access_token({"sub": str(user.id)})
    set_auth_cookie(response, token)

    return {
        "id": user.id,
        "title": user.title,
        "name": user.name,
        "email": user.email,
        "designation": user.designation,
        "role_id": user.role_id,
        "department_id": user.department_id,
        "is_approved": user.is_approved,
        "signature_path": f"/storage/{user.signature_path}" if user.signature_path else None,
        "role": {"group_key": user.role.group_key, "name": user.role.name, "value": user.role.value} if user.role else None,
        "department": {"id": user.department.id, "name": user.department.name, "short_code": user.department.short_code} if user.department else None,
    }


@router.post("/logout")
async def logout(response: Response):
    clear_auth_cookie(response)
    return {"message": "Logged out"}


@router.get("/me")
async def me(request: Request, db: AsyncSession = Depends(get_db)):
    """Return current user if authenticated, or null (HTTP 200) if not.
    Using optional auth avoids a 401 that would appear as a browser console error on initial load."""
    from app.core.security import decode_token, COOKIE_NAME
    from jose import JWTError

    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None

    try:
        payload = decode_token(token)
        user_id: int = int(payload.get("sub"))
    except (JWTError, TypeError, ValueError):
        return None

    result = await db.execute(
        select(User)
        .options(selectinload(User.role), selectinload(User.department))
        .where(User.id == user_id)
    )
    full_user = result.scalar_one_or_none()
    if not full_user:
        return None

    return {
        "id": full_user.id,
        "title": full_user.title,
        "name": full_user.name,
        "email": full_user.email,
        "designation": full_user.designation,
        "gender": full_user.gender,
        "role_id": full_user.role_id,
        "department_id": full_user.department_id,
        "is_approved": full_user.is_approved,
        "signature_path": f"/storage/{full_user.signature_path}" if full_user.signature_path else None,
        "role": {"group_key": full_user.role.group_key, "name": full_user.role.name, "value": full_user.role.value} if full_user.role else None,
        "department": {"id": full_user.department.id, "name": full_user.department.name, "short_code": full_user.department.short_code} if full_user.department else None,
    }
