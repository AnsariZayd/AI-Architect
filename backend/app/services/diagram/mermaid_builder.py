from app.schemas.architecture import ArchitectureDesign


def _node_id(value: str, index: int) -> str:
    cleaned = "".join(ch for ch in value.title() if ch.isalnum())
    return f"N{index}_{cleaned[:24] or 'Module'}"


def _label(value: str) -> str:
    return value.replace('"', "'").replace("[", "(").replace("]", ")")


def _module_name(module) -> str:
    """Extract name string from either a ModuleDetail object or a plain string."""
    if isinstance(module, str):
        return module
    return module.name if hasattr(module, "name") else str(module)


def _entity_name(entity) -> str:
    """Extract name string from either a DatabaseEntity object or a plain string."""
    if isinstance(entity, str):
        return entity
    return entity.name if hasattr(entity, "name") else str(entity)


def build_mermaid(architecture: ArchitectureDesign) -> str:
    lines = [
        "flowchart LR",
        "    classDef actor fill:#fff7ed,stroke:#c2410c,color:#1f2937",
        "    classDef app fill:#ecfeff,stroke:#0891b2,color:#1f2937",
        "    classDef service fill:#eef2ff,stroke:#4f46e5,color:#1f2937",
        "    classDef data fill:#f0fdf4,stroke:#15803d,color:#1f2937",
        "    classDef external fill:#fdf2f8,stroke:#be185d,color:#1f2937",
    ]

    module_names = [_module_name(m) for m in architecture.modules]
    entity_names = [_entity_name(e) for e in architecture.database_entities]

    node_lookup: dict[str, str] = {}
    node_index = 1

    def node(name: str, shape: str = "rect") -> str:
        nonlocal node_index
        if name not in node_lookup:
            node_lookup[name] = _node_id(name, node_index)
            node_index += 1
            if shape == "database":
                lines.append(f'    {node_lookup[name]}[("{_label(name)}")]')
            elif shape == "external":
                lines.append(f'    {node_lookup[name]}[/"{_label(name)}"/]')
            elif shape == "actor":
                lines.append(f'    {node_lookup[name]}(["{_label(name)}"])')
            else:
                lines.append(f'    {node_lookup[name]}["{_label(name)}"]')
        return node_lookup[name]

    actor_names = sorted(
        {
            flow.source
            for flow in architecture.data_flows
            if flow.source not in module_names
            and flow.source not in architecture.external_services
            and flow.source not in entity_names
        }
    )

    if actor_names:
        lines.append("    subgraph Actors")
        for actor in actor_names:
            actor_id = node(actor, "actor")
            lines.append(f"    class {actor_id} actor")
        lines.append("    end")

    frontend_modules = [
        name
        for name in module_names
        if any(keyword in name.lower() for keyword in ["app", "portal", "console", "frontend", "ui", "client", "dashboard"])
    ]
    service_modules = [name for name in module_names if name not in frontend_modules]

    if frontend_modules:
        lines.append("    subgraph Channels")
        for module in frontend_modules:
            module_id = node(module)
            lines.append(f"    class {module_id} app")
        lines.append("    end")

    if service_modules:
        lines.append("    subgraph Backend Services")
        for module in service_modules:
            module_id = node(module)
            lines.append(f"    class {module_id} service")
        lines.append("    end")

    if architecture.external_services:
        lines.append("    subgraph External Integrations")
        for service in architecture.external_services:
            service_id = node(service, "external")
            lines.append(f"    class {service_id} external")
        lines.append("    end")

    if entity_names:
        lines.append("    subgraph Data Stores")
        for entity in entity_names:
            entity_id = node(entity, "database")
            lines.append(f"    class {entity_id} data")
        lines.append("    end")

    if architecture.data_flows:
        for flow in architecture.data_flows:
            source = node(flow.source)
            target = node(flow.target)
            lines.append(f'    {source} -->|"{_label(flow.label)}"| {target}')
    else:
        previous = node("User", "actor")
        for name in module_names:
            current = node(name)
            lines.append(f"    {previous} --> {current}")
            previous = current
        for entity in entity_names:
            lines.append(f"    {previous} --> {node(entity, 'database')}")

    return "\n".join(lines)


# --------------- ER Diagram ---------------

_RELATION_MAP = {
    "one-to-one": "||--||",
    "one-to-many": "||--o{",
    "many-to-one": "}o--||",
    "many-to-many": "}o--o{",
}


def _er_safe(name: str) -> str:
    """Make a name safe for Mermaid erDiagram identifiers."""
    return name.replace(" ", "_").replace("-", "_").replace(".", "_")


def build_er_diagram(architecture: ArchitectureDesign) -> str:
    """Build a Mermaid erDiagram string from DatabaseEntity and DatabaseRelation data."""
    if not architecture.database_entities:
        return ""

    lines = [
        '%%{init: {',
        '  "theme": "base",',
        '  "themeVariables": {',
        '    "primaryColor": "#1e293b",',
        '    "primaryTextColor": "#f8fafc",',
        '    "primaryBorderColor": "#38bdf8",',
        '    "lineColor": "#64748b",',
        '    "fontFamily": "Inter, sans-serif"',
        '  },',
        '  "themeCSS": "',
        '    .er.entityBox { fill: #1e293b !important; stroke: #38bdf8 !important; stroke-width: 1.5px !important; }',
        '    .er.entityLabel { fill: #38bdf8 !important; font-weight: 700 !important; }',
        '    .er.attributeBoxEven { fill: #0b1329 !important; stroke: rgba(255, 255, 255, 0.08) !important; }',
        '    .er.attributeBoxOdd { fill: #111a36 !important; stroke: rgba(255, 255, 255, 0.08) !important; }',
        '    .er.relationshipLabel { fill: #f8fafc !important; }',
        '    .er.relationshipLabelBox { fill: #1e293b !important; stroke: #38bdf8 !important; }',
        '    .er.relationshipLine { stroke: #64748b !important; stroke-width: 1.5px !important; }',
        '    .er text, .er text *, .er tspan, .er .attributeText, .er .labelText, .er [class*="labelText"], .er [class*="attributeText"] { fill: #e2e8f0 !important; color: #e2e8f0 !important; font-family: Inter, sans-serif !important; }',
        '  "',
        '}}%%',
        "erDiagram"
    ]

    for entity in architecture.database_entities:
        entity_name = _entity_name(entity)
        safe_name = _er_safe(entity_name)

        if hasattr(entity, "columns") and entity.columns:
            lines.append(f"    {safe_name} {{")
            for col in entity.columns:
                col_type = col.type.replace("(", "_").replace(")", "").replace(",", "_").replace(" ", "_")
                # Use simplified type for Mermaid ER Diagram
                lines.append(f"        {col_type} {col.name}")
            lines.append("    }")
        else:
            lines.append(f"    {safe_name} {{")
            lines.append("        UUID id")
            lines.append("    }")

    for relation in architecture.database_relations:
        from_safe = _er_safe(relation.from_table)
        to_safe = _er_safe(relation.to_table)
        rel_symbol = _RELATION_MAP.get(
            relation.relation_type.lower().strip(), "||--o{"
        )
        label = relation.via_column or relation.relation_type
        lines.append(f'    {from_safe} {rel_symbol} {to_safe} : "{_label(label)}"')

    return "\n".join(lines)
