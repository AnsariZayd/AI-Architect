# AI Software Architect

React + FastAPI starter for generating architecture drafts from project requirements.

## What Works Now

- FastAPI backend with `/api/health`
- Project creation and in-memory version history
- Requirement analysis endpoint
- Architecture generation endpoint
- Groq integration when `GROQ_API_KEY` is configured
- Deterministic local fallback when no Groq key is present
- React workspace with requirement editor, result cards, Mermaid preview, and Markdown download

## Run Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Run Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend expects the API at `http://localhost:8000`. Override with:

```bash
VITE_API_BASE_URL=http://localhost:8000
```

## Groq

Copy `backend/.env.example` to `backend/.env` and set `GROQ_API_KEY`.

## Next Phases

1. Add PDF/DOCX/TXT upload parsing.
2. Replace in-memory storage with Supabase or Neon PostgreSQL.
3. Add stricter LLM structured output validation and retries.
4. Add AutoGen agents after the single-pass pipeline is stable.
5. Add PDF export.
