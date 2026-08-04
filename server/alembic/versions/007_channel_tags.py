"""channel_tags

Revision ID: 007_channel_tags
Revises: 006_channel_logos
Create Date: 2026-07-31
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "007_channel_tags"
down_revision: Union[str, None] = "006_channel_logos"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "channel_tags",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("stream_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(300)),
        sa.Column("tags", postgresql.JSONB(), server_default=sa.text("'[]'::jsonb")),
        sa.Column("language", sa.String(20), server_default=""),
        sa.Column("confidence", sa.Float(), server_default="0.0"),
        sa.Column("auto_tagged", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("stream_id"),
    )
    op.create_index("ix_channel_tags_stream_id", "channel_tags", ["stream_id"])


def downgrade() -> None:
    op.drop_index("ix_channel_tags_stream_id", table_name="channel_tags")
    op.drop_table("channel_tags")
