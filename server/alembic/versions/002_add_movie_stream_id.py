"""Add stream_id to movies table

Revision ID: 002_add_movie_stream_id
Create Date: 2025-07-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "002_add_movie_stream_id"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("movies", sa.Column("stream_id", sa.Integer()))
    op.create_index("idx_movies_stream_id", "movies", ["stream_id"])
    op.create_unique_constraint("uq_movies_stream_id", "movies", ["stream_id"])


def downgrade() -> None:
    op.drop_constraint("uq_movies_stream_id", "movies")
    op.drop_index("idx_movies_stream_id", "movies")
    op.drop_column("movies", "stream_id")
