"""add referral_type to pr_referrals

Revision ID: a1b2c3d4e5f6
Revises: 
Create Date: 2026-06-08

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add referral_type column with default 'consultation'
    # This distinguishes blocking consultation referrals from
    # non-blocking PI<->Superintendent clarification exchanges.
    op.add_column(
        'pr_referrals',
        sa.Column(
            'referral_type',
            sa.String(50),
            nullable=False,
            server_default='consultation'
        )
    )


def downgrade() -> None:
    op.drop_column('pr_referrals', 'referral_type')
