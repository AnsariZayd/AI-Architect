from functools import lru_cache
from pathlib import Path
from typing import Annotated, Any

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = "AI Software Architect"
    groq_api_key: Annotated[str | None, Field(alias="GROQ_API_KEY")] = None
    groq_model: Annotated[str, Field(alias="GROQ_MODEL")] = "llama-3.3-70b-versatile"
    database_url: Annotated[str | None, Field(alias="DATABASE_URL")] = None
    cors_origins: Annotated[list[str], Field(alias="CORS_ORIGINS")] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            v_stripped = v.strip()
            if v_stripped.startswith("[") and v_stripped.endswith("]"):
                import json
                try:
                    return json.loads(v_stripped)
                except Exception:
                    pass
            return [x.strip() for x in v_stripped.split(",") if x.strip()]
        return v

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        populate_by_name=True,
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
