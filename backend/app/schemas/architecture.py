from datetime import datetime

from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    requirements: str = Field(min_length=10)


class ArchitectureRequest(BaseModel):
    project_id: str | None = None
    requirements: str = Field(min_length=10)


class RequirementAnalysis(BaseModel):
    actors: list[str] = []
    features: list[str] = []
    assumptions: list[str] = []
    ambiguities: list[str] = []
    missing_requirements: list[str] = []


# --------------- Detailed sub-models ---------------


class ColumnDef(BaseModel):
    name: str
    type: str
    constraints: list[str] = []


class DatabaseEntity(BaseModel):
    name: str
    columns: list[ColumnDef] = []
    description: str = ""


class DatabaseRelation(BaseModel):
    from_table: str
    to_table: str
    relation_type: str = ""
    via_column: str = ""


class ModuleDetail(BaseModel):
    name: str
    description: str = ""
    responsibilities: list[str] = []


class ApiEndpoint(BaseModel):
    method: str
    path: str
    purpose: str
    description: str = ""
    request_body: str = ""
    response_body: str = ""
    auth_required: bool = True


class DataFlow(BaseModel):
    source: str
    target: str
    label: str


# --------------- Top-level design & response ---------------


class ArchitectureDesign(BaseModel):
    modules: list[ModuleDetail] = []
    database_entities: list[DatabaseEntity] = []
    database_relations: list[DatabaseRelation] = []
    apis: list[ApiEndpoint] = []
    external_services: list[str] = []
    data_flows: list[DataFlow] = []
    deployment_style: str = ""
    tech_stack: dict[str, str] = {}
    risks: list[str] = []


class ArchitectureResponse(BaseModel):
    analysis: RequirementAnalysis
    architecture: ArchitectureDesign
    mermaid_code: str
    er_diagram_code: str = ""
    generation_source: str = "local_fallback"
    persisted: bool = False
    version: int | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
