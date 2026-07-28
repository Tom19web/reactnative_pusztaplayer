from fastapi import APIRouter, Query, HTTPException
from sqlalchemy import select
from pydantic import BaseModel

from app.database import async_session_factory
from app.models.models import EpisodeModel

router = APIRouter(tags=["episodes"])


class EpisodePlotResponse(BaseModel):
    title: str = ""
    plot: str = ""
    air_date: str = ""


@router.get("/episodes/plot", response_model=EpisodePlotResponse)
async def get_episode_plot(
    series_id: int = Query(...),
    season: int = Query(...),
    episode: int = Query(...),
):
    async with async_session_factory() as session:
        row = (await session.execute(
            select(EpisodeModel.title, EpisodeModel.plot, EpisodeModel.air_date)
            .where(
                EpisodeModel.series_id == series_id,
                EpisodeModel.season == season,
                EpisodeModel.episode == episode,
            )
            .limit(1)
        )).one_or_none()

        if not row:
            raise HTTPException(status_code=404, detail="Episode not found")

        return EpisodePlotResponse(
            title=row[0] or "",
            plot=row[1] or "",
            air_date=row[2] or "",
        )
