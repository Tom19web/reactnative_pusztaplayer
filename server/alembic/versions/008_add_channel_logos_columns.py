"""add channel_name and matched_name columns to channel_logos

Revision ID: 008_add_channel_logos_columns
Revises: 007_channel_tags
Create Date: 2026-08-01
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "008_add_channel_logos_columns"
down_revision: Union[str, None] = "007_channel_tags"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE channel_logos ADD COLUMN IF NOT EXISTS channel_name VARCHAR(300)")
    op.execute("ALTER TABLE channel_logos ADD COLUMN IF NOT EXISTS matched_name VARCHAR(300)")


def downgrade() -> None:
    pass  # biztonság: nem törlünk oszlopokat, amik korábban is létezhettek
