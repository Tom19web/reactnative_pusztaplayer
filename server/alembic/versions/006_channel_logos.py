"""Add channel_logos table

Revision ID: 006_channel_logos
Create Date: 2025-07-28
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "006_channel_logos"
down_revision: Union[str, None] = "005_add_series_and_episodes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "channel_logos",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("stream_id", sa.Integer(), nullable=False),
        sa.Column("logo_url", sa.Text(), nullable=False),
        sa.Column("source", sa.String(100), server_default="xmltv"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("stream_id"),
    )
    op.create_index("ix_channel_logos_stream_id", "channel_logos", ["stream_id"])


def downgrade() -> None:
    op.drop_table("channel_logos")
