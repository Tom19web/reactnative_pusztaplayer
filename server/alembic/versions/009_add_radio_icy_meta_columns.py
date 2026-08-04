"""add icy_meta_title and icy_meta_checked_at columns to radio_stations

Revision ID: 009_add_radio_icy_meta_columns
Revises: 008_add_channel_logos_columns
Create Date: 2026-08-04
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "009_add_radio_icy_meta_columns"
down_revision: Union[str, None] = "008_add_channel_logos_columns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE radio_stations ADD COLUMN IF NOT EXISTS icy_meta_title TEXT")
    op.execute("ALTER TABLE radio_stations ADD COLUMN IF NOT EXISTS icy_meta_checked_at TIMESTAMP")


def downgrade() -> None:
    op.execute("ALTER TABLE radio_stations DROP COLUMN IF EXISTS icy_meta_title")
    op.execute("ALTER TABLE radio_stations DROP COLUMN IF EXISTS icy_meta_checked_at")
