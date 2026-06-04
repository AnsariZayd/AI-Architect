def architecture_prompt(requirements: str, mode: str) -> str:
  if mode == "analysis":
    return f"""You are a senior software architect performing requirements analysis.

Analyze the following project requirements thoroughly. Extract EVERY detail.

Return ONLY valid JSON with these keys:

{{
  "actors": ["<List EVERY distinct user role, external system, or persona that interacts with the system. Include their role description, e.g. 'Admin - manages users and system configuration'>"],
  "features": ["<List EVERY distinct feature or use-case implied by the requirements. Be specific: instead of 'manage orders' write 'Place new order with item selection, quantity, and delivery address'>"],
  "assumptions": ["<List realistic technical and business assumptions you are making, e.g. 'The system will use email/password authentication initially', 'PostgreSQL will be used for relational data'>"],
  "ambiguities": ["<List EVERY unclear, under-specified, or contradictory aspect of the requirements that would need stakeholder clarification>"],
  "missing_requirements": ["<List non-functional and functional requirements NOT mentioned but typically required: security, scalability, performance targets, compliance, error handling, logging, monitoring, backup/recovery, accessibility, internationalization>"]
}}

Rules:
- For EVERY feature mentioned or implied, include it. Do not summarize multiple features into one.
- actors must include ALL roles: end users, admins, external systems, background workers, etc.
- assumptions should cover technology choices, scale expectations, and business rules you are inferring.
- missing_requirements MUST include security, performance, scalability, monitoring, and data privacy considerations.
- Be domain-specific: use terminology from the actual problem domain, not generic software terms.

Requirements:
{requirements}""".strip()

  return f"""You are a principal software architect designing a production-ready system.

Analyze the requirements below and design a COMPLETE, DETAILED architecture.

Return ONLY valid JSON matching this EXACT shape:

{{
  "architecture": {{
    "modules": [
      {{
        "name": "<Module or service name>",
        "description": "<What this module does and why it exists - 1-2 sentences>",
        "responsibilities": ["<Specific responsibility 1>", "<Specific responsibility 2>", "..."]
      }}
    ],
    "database_entities": [
      {{
        "name": "<table_name in snake_case>",
        "description": "<What this table stores - 1 sentence>",
        "columns": [
          {{"name": "id", "type": "UUID", "constraints": ["PK"]}},
          {{"name": "email", "type": "VARCHAR(255)", "constraints": ["UNIQUE", "NOT NULL"]}},
          {{"name": "created_at", "type": "TIMESTAMP", "constraints": ["NOT NULL", "DEFAULT NOW()"]}}
        ]
      }}
    ],
    "database_relations": [
      {{
        "from_table": "<table_name>",
        "to_table": "<table_name>",
        "relation_type": "<one-to-one | one-to-many | many-to-many>",
        "via_column": "<foreign key column name, or join table name for many-to-many>"
      }}
    ],
    "external_services": ["<Service name - integration purpose>"],
    "data_flows": [
      {{"source": "<Actor or module name>", "target": "<Module or data store name>", "label": "<Specific business action or data movement>"}}
    ],
    "apis": [
      {{
        "method": "POST",
        "path": "/api/resource",
        "purpose": "<One-line purpose>",
        "description": "<Detailed description of what this endpoint does, validation rules, business logic>",
        "request_body": "{{\\\"email\\\": \\\"user@example.com\\\", \\\"password\\\": \\\"secure_password_123\\\", \\\"full_name\\\": \\\"John Doe\\\"}}",
        "response_body": "{{\\\"id\\\": \\\"d3b07384d113\\\", \\\"email\\\": \\\"user@example.com\\\", \\\"token\\\": \\\"eyJhbGciOi...\\\", \\\"expires_at\\\": \\\"2026-06-03T18:00:00Z\\\"}}",
        "auth_required": true
      }}
    ],
    "deployment_style": "<Detailed deployment architecture: hosting, CDN, load balancer, database hosting, caching layer, CI/CD approach>",
    "tech_stack": {{
      "frontend": "<Framework and key libraries>",
      "backend": "<Framework and language>",
      "database": "<Primary database>",
      "cache": "<Caching solution if needed>",
      "auth": "<Authentication approach>",
      "deployment": "<Cloud/hosting platform>"
    }},
    "risks": ["<Specific risk with context and suggested mitigation>"]
  }}
}}

CRITICAL RULES:
1. Design modules, database tables, and API endpoints directly addressing the user requirements.
2. Be COMPREHENSIVE — include ALL modules, database tables, API endpoints, and data flows the system needs for production readiness. Do NOT limit counts artificially.
3. Every database table must have: id, created_at, updated_at columns at minimum.
4. Include FULL CRUD endpoints for core entities, plus auth endpoints, admin endpoints, health checks, and any webhook/callback endpoints.
5. Mark foreign key columns with FK constraint and specify which table they reference.
6. DO NOT leave database_relations, apis, data_flows, external_services, risks, or tech_stack empty. They MUST be fully populated with realistic details.
7. Return ONLY the JSON object. Do not include any reasoning or explanations in the content field.

Requirements:
{requirements}""".strip()


def autogen_architecture_task(requirements: str) -> str:
  return f"""You are a controlled multi-agent architecture team. Think through
each perspective sequentially and produce a single, comprehensive JSON result.

Run this sequence internally:

1. **Requirement Agent**: Identify ALL actors (with roles), EVERY distinct feature/use-case,
   technology assumptions, ambiguities needing clarification, and missing non-functional
   requirements (security, scalability, performance, monitoring, compliance).

2. **Architect Agent**: Design the full system:
   - Modules with names, descriptions, and specific responsibilities
   - Database tables with column names, SQL types, and constraints (PK, FK, UNIQUE, NOT NULL, INDEX)
   - Table relationships (one-to-one, one-to-many, many-to-many) with FK columns or join tables
   - Complete REST API endpoints with method, path, purpose, request/response body schemas, and auth requirement
   - External service integrations with their purpose
   - Data flows between all components
   - Tech stack recommendations
   - Deployment architecture

3. **Critic Agent**: Identify specific security vulnerabilities, performance bottlenecks,
   reliability risks, data consistency issues, and scalability concerns. Each risk must
   include a mitigation strategy.

4. **Diagram Agent**: Ensure data flows are detailed and complete enough for both a
   Mermaid flowchart AND an ER diagram. Every module should appear in at least one flow.
   Every table should have relationships defined.

Return ONLY valid JSON with this exact shape:
{{
  "analysis": {{
    "actors": ["<Actor - role description>"],
    "features": ["<Specific feature description>"],
    "assumptions": ["<Technology or business assumption>"],
    "ambiguities": ["<Unclear requirement needing clarification>"],
    "missing_requirements": ["<Missing NFR or functional requirement>"]
  }},
  "architecture": {{
    "modules": [
      {{
        "name": "<Module name>",
        "description": "<What this module does>",
        "responsibilities": ["<Responsibility 1>", "<Responsibility 2>"]
      }}
    ],
    "database_entities": [
      {{
        "name": "<table_name>",
        "description": "<What this table stores>",
        "columns": [
          {{"name": "id", "type": "UUID", "constraints": ["PK"]}},
          {{"name": "created_at", "type": "TIMESTAMP", "constraints": ["NOT NULL"]}}
        ]
      }}
    ],
    "database_relations": [
      {{
        "from_table": "<table>",
        "to_table": "<table>",
        "relation_type": "<one-to-one|one-to-many|many-to-many>",
        "via_column": "<FK column or join table>"
      }}
    ],
    "external_services": ["<Service - purpose>"],
    "data_flows": [
      {{"source": "", "target": "", "label": ""}}
    ],
    "apis": [
      {{
        "method": "POST",
        "path": "/api/example",
        "purpose": "Example API",
        "description": "Detailed description",
        "request_body": "{{\\\"username\\\": \\\"johndoe\\\", \\\"status\\\": \\\"active\\\"}}",
        "response_body": "{{\\\"id\\\": \\\"d3b07384d113\\\", \\\"username\\\": \\\"johndoe\\\", \\\"status\\\": \\\"active\\\", \\\"created_at\\\": \\\"2026-06-03T18:00:00Z\\\"}}",
        "auth_required": true
      }}
    ],
    "deployment_style": "<Full deployment description>",
    "tech_stack": {{
      "frontend": "",
      "backend": "",
      "database": "",
      "cache": "",
      "auth": "",
      "deployment": ""
    }},
    "risks": ["<Risk with mitigation>"]
  }}
}}

CRITICAL:
- Include corresponding modules, tables, and API endpoints for ALL core features.
- Be COMPREHENSIVE — include ALL modules, database tables, API endpoints, and data flows the system requires. Do NOT limit counts artificially.
- Include FULL CRUD endpoints, auth endpoints, admin endpoints, and health checks.
- DO NOT leave database_relations, apis, data_flows, external_services, risks, or tech_stack empty. They MUST be fully populated.

Requirements:
{requirements}""".strip()
