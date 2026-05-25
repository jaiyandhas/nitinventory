from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://iris:iris_secret@iris-db:5432/iris"
    SECRET_KEY: str = "change-me"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_PASS: str = ""  # For backward compatibility
    SMTP_FROM: str = "iris@nitt.edu"
    STORAGE_PATH: str = "/app/storage"
    FRONTEND_URL: str = "http://localhost:5173"
    ENVIRONMENT: str = "development"

    @property
    def is_dev(self) -> bool:
        return self.ENVIRONMENT == "development"


settings = Settings()
