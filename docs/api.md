# API

## Health

`GET /api/health`

Returns:

```json
{"status": "ok"}
```

## Create Project

`POST /api/projects`

```json
{
  "name": "Architecture Draft",
  "description": "Generated from requirement text"
}
```

## Analyze Requirements

`POST /api/generate/analyze`

```json
{
  "requirements": "Build a web app..."
}
```

## Generate Architecture

`POST /api/generate/architecture`

```json
{
  "project_id": "optional-project-id",
  "requirements": "Build a web app..."
}
```
