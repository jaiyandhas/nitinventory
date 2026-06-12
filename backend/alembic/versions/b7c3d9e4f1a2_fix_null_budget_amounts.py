"""fix_null_budget_amounts

Revision ID: b7c3d9e4f1a2
Revises: ef00378a2363
Create Date: 2026-06-12 09:55:00.000000

Fixes NULL values in committed_amount and utilized_amount columns of budget_master
that were not properly defaulted in older rows, causing incorrect available_balance
calculations (Available = Total - committed - utilized became Total - NULL = NULL).

Also adds an index on budget_master.created_at for efficient newest-first sorting.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'b7c3d9e4f1a2'
down_revision: Union[str, None] = 'ef00378a2363'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Fix any NULL committed_amount values → 0.0
    op.execute(
        "UPDATE budget_master SET committed_amount = 0.0 WHERE committed_amount IS NULL"
    )
    # Fix any NULL utilized_amount values → 0.0
    op.execute(
        "UPDATE budget_master SET utilized_amount = 0.0 WHERE utilized_amount IS NULL"
    )

    # Ensure server-side defaults are set so future rows always get 0.0
    # (safe to run even if columns already have defaults)
    op.alter_column(
        'budget_master', 'committed_amount',
        existing_type=sa.Float(),
        nullable=False,
        server_default='0.0'
    )
    op.alter_column(
        'budget_master', 'utilized_amount',
        existing_type=sa.Float(),
        nullable=False,
        server_default='0.0'
    )

    # Add index on created_at for fast newest-first ordering
    op.create_index(
        'ix_budget_master_created_at',
        'budget_master',
        ['created_at'],
        unique=False
    )


def downgrade() -> None:
    op.drop_index('ix_budget_master_created_at', table_name='budget_master')
    op.alter_column(
        'budget_master', 'committed_amount',
        existing_type=sa.Float(),
        nullable=True,
        server_default=None
    )
    op.alter_column(
        'budget_master', 'utilized_amount',
        existing_type=sa.Float(),
        nullable=True,
        server_default=None
    )
