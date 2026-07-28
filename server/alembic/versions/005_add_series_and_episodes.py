"""Add series and episodes tables

Revision ID: 005_add_series_and_episodes
Create Date: 2025-07-28
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

revision: str = "005_add_series_and_episodes"
down_revision: Union[str, None] = "004_add_qr_sessions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "series",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("series_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("year", sa.String(10), nullable=True),
        sa.Column("plot", sa.Text(), nullable=True),
        sa.Column("genre", sa.Text(), nullable=True),
        sa.Column("cast", sa.Text(), nullable=True),
        sa.Column("director", sa.Text(), nullable=True),
        sa.Column("rating", sa.String(10), nullable=True),
        sa.Column("cover", sa.String(1000), nullable=True),
        sa.Column("tmdb_id", sa.Integer(), nullable=True, index=True),
        sa.Column("embedding", Vector(1536), nullable=True),
        sa.Column("meta", sa.dialects.postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("series_id"),
    )
    op.create_index("ix_series_series_id", "series", ["series_id"])

    op.create_table(
        "episodes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("series_id", sa.Integer(), sa.ForeignKey("series.series_id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("season", sa.Integer(), nullable=False),
        sa.Column("episode", sa.Integer(), nullable=False),
        sa.Column("plot", sa.Text(), nullable=True),
        sa.Column("air_date", sa.String(20), nullable=True),
        sa.Column("embedding", Vector(1536), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("series_id", "season", "episode", name="uq_series_season_episode"),
    )


def downgrade() -> None:
    op.drop_table("episodes")
    op.drop_table("series")
