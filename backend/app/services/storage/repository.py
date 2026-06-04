import json
from datetime import datetime
from typing import Protocol

import psycopg
from psycopg.rows import dict_row

from app.core.config import settings
from app.schemas.project import ProjectCreate, ProjectRead


class Repository(Protocol):
    def create_project(self, payload: ProjectCreate) -> ProjectRead: ...

    def list_projects(self) -> list[ProjectRead]: ...

    def get_project(self, project_id: str) -> ProjectRead | None: ...

    def add_requirement(
        self, project_id: str, raw_text: str, parsed_text: str | None = None
    ) -> str | None: ...

    def add_version(
        self, project_id: str, architecture: dict, mermaid_code: str
    ) -> int | None: ...

    def list_versions(self, project_id: str) -> list[dict]: ...


class InMemoryRepository:
    storage_name = "memory"

    def __init__(self) -> None:
        self.projects: dict[str, ProjectRead] = {}
        self.requirements: dict[str, list[dict]] = {}
        self.versions: dict[str, list[dict]] = {}

    def create_project(self, payload: ProjectCreate) -> ProjectRead:
        project = ProjectRead(name=payload.name, description=payload.description)
        self.projects[project.id] = project
        self.requirements[project.id] = []
        self.versions[project.id] = []
        return project

    def list_projects(self) -> list[ProjectRead]:
        return sorted(self.projects.values(), key=lambda item: item.created_at, reverse=True)

    def get_project(self, project_id: str) -> ProjectRead | None:
        return self.projects.get(project_id)

    def add_requirement(
        self, project_id: str, raw_text: str, parsed_text: str | None = None
    ) -> str | None:
        requirement_id = f"memory-requirement-{len(self.requirements.get(project_id, [])) + 1}"
        self.requirements.setdefault(project_id, []).append(
            {
                "id": requirement_id,
                "project_id": project_id,
                "raw_text": raw_text,
                "parsed_text": parsed_text,
                "created_at": datetime.utcnow().isoformat(),
            }
        )
        return requirement_id

    def add_version(
        self, project_id: str, architecture: dict, mermaid_code: str
    ) -> int | None:
        if project_id not in self.versions:
            self.versions[project_id] = []
        version = len(self.versions[project_id]) + 1
        architecture["version"] = version
        architecture["mermaid_code"] = mermaid_code
        self.versions[project_id].append(architecture)
        return version

    def list_versions(self, project_id: str) -> list[dict]:
        return self.versions.get(project_id, [])


class PostgresRepository:
    storage_name = "postgres"

    def __init__(self, database_url: str) -> None:
        self.database_url = database_url
        self._ensure_schema()

    def _connect(self):
        return psycopg.connect(self.database_url, row_factory=dict_row)

    def _ensure_schema(self) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    create extension if not exists pgcrypto;

                    create table if not exists projects (
                      id uuid primary key default gen_random_uuid(),
                      name text not null,
                      description text not null default '',
                      created_at timestamptz not null default now()
                    );

                    create table if not exists requirements (
                      id uuid primary key default gen_random_uuid(),
                      project_id uuid not null references projects(id) on delete cascade,
                      raw_text text not null,
                      parsed_text text,
                      created_at timestamptz not null default now()
                    );

                    create table if not exists architectures (
                      id uuid primary key default gen_random_uuid(),
                      project_id uuid not null references projects(id) on delete cascade,
                      version integer not null,
                      architecture_json jsonb not null,
                      mermaid_code text not null,
                      created_at timestamptz not null default now(),
                      unique (project_id, version)
                    );

                    create table if not exists feedback (
                      id uuid primary key default gen_random_uuid(),
                      architecture_id uuid not null references architectures(id) on delete cascade,
                      user_note text not null,
                      created_at timestamptz not null default now()
                    );
                    """
                )

    def _project_from_row(self, row: dict) -> ProjectRead:
        return ProjectRead(
            id=str(row["id"]),
            name=row["name"],
            description=row["description"],
            created_at=row["created_at"],
        )

    def create_project(self, payload: ProjectCreate) -> ProjectRead:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    insert into projects (name, description)
                    values (%s, %s)
                    returning id, name, description, created_at
                    """,
                    (payload.name, payload.description),
                )
                row = cursor.fetchone()
        return self._project_from_row(row)

    def list_projects(self) -> list[ProjectRead]:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    select id, name, description, created_at
                    from projects
                    order by created_at desc
                    """
                )
                rows = cursor.fetchall()
        return [self._project_from_row(row) for row in rows]

    def get_project(self, project_id: str) -> ProjectRead | None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    select id, name, description, created_at
                    from projects
                    where id = %s
                    """,
                    (project_id,),
                )
                row = cursor.fetchone()
        return self._project_from_row(row) if row else None

    def add_requirement(
        self, project_id: str, raw_text: str, parsed_text: str | None = None
    ) -> str | None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    insert into requirements (project_id, raw_text, parsed_text)
                    values (%s, %s, %s)
                    returning id
                    """,
                    (project_id, raw_text, parsed_text),
                )
                row = cursor.fetchone()
        return str(row["id"]) if row else None

    def add_version(
        self, project_id: str, architecture: dict, mermaid_code: str
    ) -> int | None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    select coalesce(max(version), 0) + 1 as next_version
                    from architectures
                    where project_id = %s
                    """,
                    (project_id,),
                )
                version = cursor.fetchone()["next_version"]
                cursor.execute(
                    """
                    insert into architectures (
                      project_id,
                      version,
                      architecture_json,
                      mermaid_code
                    )
                    values (%s, %s, %s, %s)
                    """,
                    (project_id, version, json.dumps(architecture), mermaid_code),
                )
        return int(version)

    def list_versions(self, project_id: str) -> list[dict]:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    select version, architecture_json, mermaid_code, created_at
                    from architectures
                    where project_id = %s
                    order by version desc
                    """,
                    (project_id,),
                )
                rows = cursor.fetchall()
        return rows


def build_repository() -> Repository:
    if settings.database_url:
        return PostgresRepository(settings.database_url)
    return InMemoryRepository()


repository = build_repository()
