from fastapi import APIRouter

from app.core.config import settings
from app.services.agents.autogen_runner import autogen_runner
from app.services.llm.groq_client import groq_client
from app.services.storage.repository import repository


router = APIRouter()


@router.get("/health")
def health() -> dict[str, str | bool]:
    return {
        "status": "ok",
        "groq_configured": bool(settings.groq_api_key),
        "groq_model": settings.groq_model,
        "database_configured": bool(settings.database_url),
        "storage": getattr(repository, "storage_name", "unknown"),
        "autogen_status": autogen_runner.last_status,
        "groq_status": groq_client.last_status,
    }
