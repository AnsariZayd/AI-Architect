# Architecture

The application is split into a React frontend and FastAPI backend.

## Frontend

The React app provides the main project workspace:

- Requirement text input
- Backend health status
- Architecture generation action
- Structured result cards
- Mermaid diagram rendering
- Markdown export

## Backend

The FastAPI app exposes:

- `GET /api/health`
- `POST /api/projects`
- `GET /api/projects`
- `POST /api/generate/analyze`
- `POST /api/generate/architecture`

The generation flow starts with a single orchestrator. It calls Groq when a key is configured and otherwise returns a deterministic fallback so the product can be developed without blocking on LLM setup.

## Planned Storage

The current implementation uses an in-memory repository. The intended production storage is Supabase Free or Neon Free with these tables:

- `projects`
- `requirements`
- `architectures`
- `feedback`
