"""Shared Pydantic response models for admin endpoints."""
from pydantic import BaseModel
from typing import Any


class StatusResponse(BaseModel):
    ok: bool = True
    message: str = ""


class PaginatedResponse(BaseModel):
    page: int = 1
    pages: int = 1
    total: int = 0
    items: list[Any] = []


class AdminStatsResponse(BaseModel):
    sessions: int = 0
    logos: int = 0
    epg_programs: int = 0
    channels_with_epg: int = 0
    channels_now_playing: int = 0
    last_import: str = "N/A"
