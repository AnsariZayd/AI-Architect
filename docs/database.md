# Database Setup

Use PostgreSQL for the hosted database. Supabase Free and Neon Free both work for this project.

## Option 1: Supabase

1. Create a new Supabase project.
2. Open the SQL editor.
3. Paste and run `backend/sql/schema.sql`.
4. Copy the project database connection string.
5. Put it in `backend/.env` as `DATABASE_URL`.

## Option 2: Neon

1. Create a new Neon project.
2. Open the SQL editor.
3. Paste and run `backend/sql/schema.sql`.
4. Copy the pooled connection string.
5. Put it in `backend/.env` as `DATABASE_URL`.

## Environment

Create `backend/.env` from `backend/.env.example`:

```env
GROQ_API_KEY=your_groq_key
GROQ_MODEL=llama-3.3-70b-versatile
DATABASE_URL=postgresql://user:password@host:5432/database
CORS_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173"]
```

The current backend still uses in-memory storage. The next implementation step is to add a PostgreSQL repository that reads `DATABASE_URL`.
