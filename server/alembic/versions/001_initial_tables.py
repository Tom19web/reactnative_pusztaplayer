"""Initial tables

Revision ID: 001_initial
Create Date: 2025-07-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from pgvector.sqlalchemy import Vector

revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "movies",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("year", sa.String(10)),
        sa.Column("plot", sa.Text()),
        sa.Column("genre", sa.String(500)),
        sa.Column("cast", sa.Text()),
        sa.Column("director", sa.String(500)),
        sa.Column("rating", sa.String(10)),
        sa.Column("tmdb_id", sa.Integer()),
        sa.Column("poster_full", sa.String(1000)),
        sa.Column("poster_thumb", sa.String(1000)),
        sa.Column("backdrop_url", sa.String(1000)),
        sa.Column("duration", sa.String(10)),
        sa.Column("country", sa.String(200)),
        sa.Column("embedding", Vector(1536)),
        sa.Column("meta", postgresql.JSONB()),
        sa.Column("created_at", sa.DateTime()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_movies_title", "movies", ["title"])
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_movies_embedding_hnsw "
        "ON movies USING hnsw (embedding vector_cosine_ops) "
        "WITH (m = 16, ef_construction = 200)"
    )

    op.create_table(
        "channels",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("slug", sa.String(200), nullable=False),
        sa.Column("display_name", sa.String(500)),
        sa.Column("logo_url", sa.String(1000)),
        sa.Column("category", sa.String(200)),
        sa.Column("stream_id", sa.Integer()),
        sa.Column("meta", postgresql.JSONB()),
        sa.Column("created_at", sa.DateTime()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_index("ix_channels_slug", "channels", ["slug"])
    op.create_index("ix_channels_stream_id", "channels", ["stream_id"])

    op.create_table(
        "epg_programs",
        sa.Column("id", sa.String(100), nullable=False),
        sa.Column("channel_id", sa.String(100)),
        sa.Column("channel_name", sa.String(300)),
        sa.Column("title", sa.String(1000)),
        sa.Column("clean_title", sa.String(1000)),
        sa.Column("start", sa.String(50)),
        sa.Column("end", sa.String(50)),
        sa.Column("description", sa.Text()),
        sa.Column("start_timestamp", sa.Integer()),
        sa.Column("stop_timestamp", sa.Integer()),
        sa.Column("category", sa.String(200)),
        sa.Column("genre", sa.String(500)),
        sa.Column("cast", sa.Text()),
        sa.Column("ai_enriched", postgresql.JSONB()),
        sa.Column("created_at", sa.DateTime()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_epg_channel_id", "epg_programs", ["channel_id"])
    op.create_index("ix_epg_start_timestamp", "epg_programs", ["start_timestamp"])
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_epg_channel_range "
        "ON epg_programs (channel_id, start_timestamp, stop_timestamp)"
    )

    op.create_table(
        "user_profiles",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("profile_id", sa.String(100), nullable=False),
        sa.Column("name", sa.String(200)),
        sa.Column("interests", postgresql.JSONB()),
        sa.Column("fcm_token", sa.String(500)),
        sa.Column("is_active", sa.Boolean(), default=True),
        sa.Column("created_at", sa.DateTime()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("profile_id"),
    )
    op.create_index("ix_user_profile_id", "user_profiles", ["profile_id"])


def downgrade() -> None:
    op.drop_table("user_profiles")
    op.drop_table("epg_programs")
    op.drop_table("channels")
    op.drop_table("movies")
    op.execute("DROP EXTENSION IF EXISTS vector")