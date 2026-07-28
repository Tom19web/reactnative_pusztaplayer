"""Add radio_stations table

Revision ID: 003_add_radio_stations
Create Date: 2025-07-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "003_add_radio_stations"
down_revision: Union[str, None] = "002_add_movie_stream_id"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "radio_stations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("station_uuid", sa.String(100)),
        sa.Column("name", sa.String(300), nullable=False),
        sa.Column("stream_url", sa.String(1000), nullable=False),
        sa.Column("favicon", sa.String(1000)),
        sa.Column("homepage", sa.String(500)),
        sa.Column("tags", sa.String(500)),
        sa.Column("country", sa.String(100)),
        sa.Column("state", sa.String(200)),
        sa.Column("language", sa.String(100)),
        sa.Column("codec", sa.String(50)),
        sa.Column("bitrate", sa.Integer()),
        sa.Column("votes", sa.Integer(), default=0),
        sa.Column("is_active", sa.Boolean(), default=True),
        sa.Column("created_at", sa.DateTime()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("station_uuid"),
    )
    op.create_index("ix_radio_name", "radio_stations", ["name"])
    op.create_index("ix_radio_station_uuid", "radio_stations", ["station_uuid"])
    op.create_index("ix_radio_tags", "radio_stations", ["tags"])


def downgrade() -> None:
    op.drop_table("radio_stations")
