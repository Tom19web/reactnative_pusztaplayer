from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from pgvector.sqlalchemy import Vector

from app.database import Base


class MovieModel(Base):
    __tablename__ = "movies"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(500), nullable=False, index=True)
    year = Column(String(10))
    plot = Column(Text)
    genre = Column(String(500))
    cast = Column(Text)
    director = Column(String(500))
    rating = Column(String(10))
    tmdb_id = Column(Integer)
    poster_full = Column(String(1000))
    poster_thumb = Column(String(1000))
    backdrop_url = Column(String(1000))
    duration = Column(String(10))
    country = Column(String(200))
    stream_id = Column(Integer, unique=True, index=True)
    embedding = Column(Vector(1536))
    meta = Column(JSONB)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class ChannelModel(Base):
    __tablename__ = "channels"

    id = Column(Integer, primary_key=True, autoincrement=True)
    slug = Column(String(200), unique=True, index=True)
    display_name = Column(String(500))
    logo_url = Column(String(1000))
    category = Column(String(200))
    stream_id = Column(Integer, index=True)
    meta = Column(JSONB)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class EpgProgramModel(Base):
    __tablename__ = "epg_programs"

    id = Column(String(100), primary_key=True)
    channel_id = Column(String(100), index=True)
    channel_name = Column(String(300))
    title = Column(String(1000))
    clean_title = Column(String(1000))
    start = Column(String(50))
    end = Column(String(50))
    description = Column(Text)
    start_timestamp = Column(Integer, index=True)
    stop_timestamp = Column(Integer)
    category = Column(String(200))
    genre = Column(String(500))
    cast = Column(Text)
    ai_enriched = Column(JSONB)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class UserProfileModel(Base):
    __tablename__ = "user_profiles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    profile_id = Column(String(100), unique=True, index=True, nullable=False)
    name = Column(String(200))
    interests = Column(JSONB)
    fcm_token = Column(String(500))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class RadioStationModel(Base):
    __tablename__ = "radio_stations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    station_uuid = Column(String(100), unique=True, index=True)
    name = Column(String(300), nullable=False, index=True)
    stream_url = Column(String(1000), nullable=False)
    favicon = Column(String(1000))
    homepage = Column(String(500))
    tags = Column(String(500))
    country = Column(String(100))
    state = Column(String(200))
    language = Column(String(100))
    codec = Column(String(50))
    bitrate = Column(Integer)
    votes = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class SeriesModel(Base):
    __tablename__ = "series"

    id = Column(Integer, primary_key=True, autoincrement=True)
    series_id = Column(Integer, unique=True, index=True, nullable=False)
    title = Column(String(500), nullable=False, index=True)
    year = Column(String(10))
    plot = Column(Text)
    genre = Column(String(500))
    cast = Column(Text)
    director = Column(String(500))
    rating = Column(String(10))
    tmdb_id = Column(Integer, index=True)
    cover = Column(String(1000))
    embedding = Column(Vector(1536))
    meta = Column(JSONB)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class EpisodeModel(Base):
    __tablename__ = "episodes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    series_id = Column(Integer, ForeignKey("series.series_id", ondelete="CASCADE"), index=True, nullable=False)
    title = Column(String(500), nullable=False)
    season = Column(Integer, nullable=False)
    episode = Column(Integer, nullable=False)
    plot = Column(Text)
    air_date = Column(String(20))
    embedding = Column(Vector(1536))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("series_id", "season", "episode", name="uq_series_season_episode"),
    )


class QrSessionModel(Base):
    __tablename__ = "qr_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(20), unique=True, index=True, nullable=False)
    status = Column(String(20), default="pending")
    xtream_user = Column(String(200))
    xtream_pass = Column(String(200))
    user_email = Column(String(300))
    nickname = Column(String(200))
    phone = Column(String(50))
    api_key = Column(String(200))
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
