from fastapi import APIRouter, HTTPException

from app.schemas.project import ProjectCreate, ProjectRead
from app.services.storage.repository import repository


router = APIRouter()


@router.post("", response_model=ProjectRead)
def create_project(payload: ProjectCreate) -> ProjectRead:
    return repository.create_project(payload)


@router.get("", response_model=list[ProjectRead])
def list_projects() -> list[ProjectRead]:
    return repository.list_projects()


@router.get("/{project_id}", response_model=ProjectRead)
def get_project(project_id: str) -> ProjectRead:
    project = repository.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("/{project_id}/versions")
def list_versions(project_id: str) -> list[dict]:
    return repository.list_versions(project_id)
