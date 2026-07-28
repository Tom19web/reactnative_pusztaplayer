"""Add qr_sessions table

Revision ID: 004_add_qr_sessions
Create Date: 2025-07-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "004_add_qr_sessions"
down_revision: Union[str, None] = "003_add_radio_stations"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "qr_sessions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("code", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), default="pending"),
        sa.Column("xtream_user", sa.String(200)),
        sa.Column("xtream_pass", sa.String(200)),
        sa.Column("user_email", sa.String(300)),
        sa.Column("nickname", sa.String(200)),
        sa.Column("phone", sa.String(50)),
        sa.Column("api_key", sa.String(200)),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_index("ix_qr_code", "qr_sessions", ["code"])


def downgrade() -> None:
    op.drop_table("qr_sessions")
