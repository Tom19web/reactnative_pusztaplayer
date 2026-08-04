from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://puszta:puszta_secret@localhost:5432/pusztaplayer"
    REDIS_URL: str = "redis://localhost:6379/0"
    SERVER_DOMAIN: str = "live.pusztaplay.eu"
    XTREAM_API_BASE: str = "https://live.pusztaplay.eu"
    GITHUB_TOKEN: str = ""
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"
    DEEPSEEK_MODEL: str = "deepseek-chat"
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = "https://api.openai.com"
    TMDB_API_KEY: str = ""
    OPENSUBTITLES_API_KEY: str = ""
    FCM_CREDENTIALS_JSON: str = ""
    CORS_ORIGINS: list[str] = ["*"]
    DEBUG: bool = False
    PROXY_AUTH_KEY: str = ""
    ADMIN_USER: str = ""
    ADMIN_PASS: str = ""
    RAPIDAPI_KEY: str = ""
    XTREAM_USERNAME: str = ""
    XTREAM_PASSWORD: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
