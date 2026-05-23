from typing import Annotated, List
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import JWTError

from app.core.database import get_db
from app.core.security import decode_token, COOKIE_NAME


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    from app.models.user import User
    from sqlalchemy.orm import selectinload

    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        payload = decode_token(token)
        user_id: int = int(payload.get("sub"))
    except (JWTError, TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    result = await db.execute(
        select(User)
        .options(selectinload(User.role), selectinload(User.department))
        .where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def require_roles(*allowed_roles: str):
    """Dependency factory: raises 403 if user's group_key not in allowed_roles."""
    async def _checker(user=Depends(get_current_user)):
        if user.role.group_key not in allowed_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user
    return _checker


def require_own_department():
    """HOD-scope: ensures HOD can only access their own department's data."""
    async def _checker(user=Depends(get_current_user)):
        if user.role.group_key not in ("hod", "admin"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user
    return _checker


CurrentUser = Annotated[object, Depends(get_current_user)]
