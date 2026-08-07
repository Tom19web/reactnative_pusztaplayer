from sqlalchemy import select, literal, literal_column, union_all, func, cast, String
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.models import MovieModel, SeriesModel, EpisodeModel


class VectorEngine:
    """pgvector cosine similarity search engine."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def search_by_vector(
        self,
        query_vector: list[float],
        limit: int = 10,
        threshold: float = 0.50,
    ) -> list[dict]:
        """Semantic search across movies, series AND episodes."""
        m_title = MovieModel.title
        m_year = MovieModel.year
        m_type = literal("movie").label("type")
        m_desc = MovieModel.plot.label("description")
        m_poster = MovieModel.poster_full.label("poster_url")
        m_sim = (1 - MovieModel.embedding.cosine_distance(query_vector)).label("similarity")

        movie_stmt = (
            select(m_title, m_year, m_type, m_desc, m_poster, m_sim)
            .where(MovieModel.embedding.cosine_distance(query_vector) < (1 - threshold))
            .limit(limit)
        )

        s_title = SeriesModel.title
        s_year = SeriesModel.year
        s_type = literal("series").label("type")
        s_desc = SeriesModel.plot.label("description")
        s_poster = SeriesModel.cover.label("poster_url")
        s_sim = (1 - SeriesModel.embedding.cosine_distance(query_vector)).label("similarity")

        series_stmt = (
            select(s_title, s_year, s_type, s_desc, s_poster, s_sim)
            .where(SeriesModel.embedding.cosine_distance(query_vector) < (1 - threshold))
            .limit(limit)
        )

        e_title = EpisodeModel.title.label("title")
        e_year = literal("").label("year")
        e_type = literal("episode").label("type")
        e_desc = EpisodeModel.plot.label("description")
        e_poster = literal("").label("poster_url")
        e_sim = (1 - EpisodeModel.embedding.cosine_distance(query_vector)).label("similarity")

        episode_stmt = (
            select(e_title, e_year, e_type, e_desc, e_poster, e_sim)
            .where(EpisodeModel.embedding.cosine_distance(query_vector) < (1 - threshold))
            .limit(limit)
        )

        union_stmt = select(
            literal_column("title"), literal_column("year"), literal_column("type"),
            literal_column("description"), literal_column("poster_url"),
            literal_column("similarity"),
        ).select_from(
            union_all(movie_stmt, series_stmt, episode_stmt).subquery()
        ).order_by(literal_column("similarity").desc()).limit(limit)

        result = await self.session.execute(union_stmt)
        return [
            {
                "title": row.title,
                "year": row.year,
                "type": row.type,
                "description": row.description,
                "poster_url": _rewrite_image_url(row.poster_url),
                "similarity": round(float(row.similarity), 4),
            }
            for row in result
        ]

    async def recommend_by_vector(
        self,
        query_vector: list[float],
        limit: int = 10,
        threshold: float = 0.45,
    ) -> list[dict]:
        """Search movies, series AND episodes by vector similarity."""
        m_key = MovieModel.stream_id.label("key")
        m_title = MovieModel.title
        m_year = MovieModel.year
        m_genre = MovieModel.genre
        m_type = literal("movie").label("type")
        m_desc = MovieModel.plot.label("description")
        m_poster = MovieModel.poster_full.label("poster_url")
        m_sim = (1 - MovieModel.embedding.cosine_distance(query_vector)).label("similarity")

        movie_stmt = (
            select(m_key, m_title, m_year, m_genre, m_type, m_desc, m_poster, m_sim)
            .where(MovieModel.embedding.cosine_distance(query_vector) < (1 - threshold))
            .limit(limit)
        )

        s_key = SeriesModel.series_id.label("key")
        s_title = SeriesModel.title
        s_year = SeriesModel.year
        s_genre = SeriesModel.genre
        s_type = literal("series").label("type")
        s_desc = SeriesModel.plot.label("description")
        s_poster = SeriesModel.cover.label("poster_url")
        s_sim = (1 - SeriesModel.embedding.cosine_distance(query_vector)).label("similarity")

        series_stmt = (
            select(s_key, s_title, s_year, s_genre, s_type, s_desc, s_poster, s_sim)
            .where(SeriesModel.embedding.cosine_distance(query_vector) < (1 - threshold))
            .limit(limit)
        )

        e_key = EpisodeModel.series_id.label("key")
        e_title = func.concat(
            func.concat('S', cast(EpisodeModel.season, String)),
            func.concat('E', cast(EpisodeModel.episode, String)),
            ' - ', EpisodeModel.title,
        ).label("title")
        e_year = literal("").label("year")
        e_genre = literal("").label("genre")
        e_type = literal("episode").label("type")
        e_desc = EpisodeModel.plot.label("description")
        e_poster = literal("").label("poster_url")
        e_sim = (1 - EpisodeModel.embedding.cosine_distance(query_vector)).label("similarity")

        episode_stmt = (
            select(e_key, e_title, e_year, e_genre, e_type, e_desc, e_poster, e_sim)
            .where(EpisodeModel.embedding.cosine_distance(query_vector) < (1 - threshold))
            .limit(limit)
        )

        union_stmt = select(
            literal_column("key"), literal_column("title"), literal_column("year"),
            literal_column("genre"), literal_column("type"), literal_column("description"),
            literal_column("poster_url"), literal_column("similarity"),
        ).select_from(
            union_all(movie_stmt, series_stmt, episode_stmt).subquery()
        ).order_by(literal_column("similarity").desc()).limit(limit)

        result = await self.session.execute(union_stmt)
        return [
            {
                "key": str(row.key),
                "title": row.title,
                "year": row.year or "",
                "genre": row.genre or "",
                "type": row.type,
                "description": row.description or "",
                "poster_url": _rewrite_image_url(row.poster_url) if row.poster_url else "",
                "similarity": round(float(row.similarity), 4),
            }
            for row in result
        ]


def _rewrite_image_url(raw_url: str, size: int = 200) -> str:
    if not raw_url or "movaloget.cc" not in raw_url:
        return raw_url
    import re
    path = re.sub(r'^.*movaloget\.cc:?\d*/?', '', raw_url)
    return f"https://live.pusztaplay.eu/images/{path}"
