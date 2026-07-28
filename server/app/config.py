from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://puszta:puszta_secret@localhost:5432/pusztaplayer"
    REDIS_URL: str = "redis://localhost:6379/0"
    SERVER_DOMAIN: str = "live.pusztaplay.eu"
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = "https://api.openai.com"
    TMDB_API_KEY: str = ""
    OPENSUBTITLES_API_KEY: str = ""
    FCM_CREDENTIALS_JSON: str = ""
    CORS_ORIGINS: list[str] = ["*"]
    DEBUG: bool = False

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
