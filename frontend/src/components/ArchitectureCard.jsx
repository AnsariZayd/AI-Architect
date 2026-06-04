import { useState } from "react";
import {
  Boxes,
  Cpu,
  Database,
  GitBranch,
  Link2,
  Plug,
  Router,
  ShieldAlert,
  Table2,
  ChevronDown,
  Copy,
  Check,
  Code,
} from "lucide-react";

/* ---------- Helper to verify non-empty/non-trivial values ---------- */

function hasMeaningfulBody(body) {
  if (!body) return false;
  if (typeof body === "string") {
    const trimmed = body.trim().toLowerCase();
    return (
      trimmed !== "" &&
      trimmed !== "{}" &&
      trimmed !== "[]" &&
      trimmed !== "null" &&
      trimmed !== "none" &&
      trimmed !== "undefined"
    );
  }
  if (typeof body === "object") {
    return Object.keys(body).length > 0;
  }
  return true;
}

/* ---------- Reusable Collapsible Block ---------- */

function CollapsibleSection({
  title,
  count,
  icon: Icon,
  className = "",
  defaultExpanded = true,
  children,
  headerAction,
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <section className={`result-block ${className} ${isExpanded ? "" : "collapsed"}`}>
      <div
        className="collapsible-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          userSelect: "none",
        }}
      >
        <div
          onClick={() => setIsExpanded(!isExpanded)}
          style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", flex: 1 }}
        >
          <Icon size={17} aria-hidden="true" />
          <h3 style={{ margin: 0 }}>
            {title}
            {count !== undefined && count !== null && (
              <span className="section-count">
                {count}
              </span>
            )}
          </h3>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {headerAction}
          <ChevronDown
            size={16}
            onClick={() => setIsExpanded(!isExpanded)}
            className={`chevron ${isExpanded ? "" : "collapsed"}`}
            style={{
              transition: "transform 0.3s ease",
              transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)",
              cursor: "pointer",
            }}
          />
        </div>
      </div>
      <div
        className={`collapsible-content ${isExpanded ? "expanded" : "collapsed"}`}
        style={{
          maxHeight: isExpanded ? "4000px" : "0px",
          overflow: "hidden",
          transition: "max-height 0.4s cubic-bezier(0, 1, 0, 1)",
        }}
      >
        <div style={{ paddingTop: "14px" }}>{children}</div>
      </div>
    </section>
  );
}

/* ---------- Simple string list block ---------- */

function ListBlock({ title, icon: Icon, items }) {
  const safeItems = Array.isArray(items) ? items : [];

  return (
    <CollapsibleSection title={title} count={safeItems.length} icon={Icon}>
      <ul>
        {safeItems.map((item, index) => (
          <li key={typeof item === "string" ? item : `${title}-${index}`}>
            {typeof item === "string" ? item : JSON.stringify(item)}
          </li>
        ))}
        {safeItems.length === 0 && <li className="muted-item">No items matching criteria</li>}
      </ul>
    </CollapsibleSection>
  );
}

/* ---------- Module cards with descriptions ---------- */

function ModulesBlock({ modules }) {
  const safe = Array.isArray(modules) ? modules : [];

  return (
    <CollapsibleSection
      title="Modules"
      count={safe.length}
      icon={Boxes}
      className="wide"
    >
      {safe.length === 0 && <p className="muted-item">No items matching criteria</p>}
      <div className="modules-grid">
        {safe.map((mod, i) => {
          const name = typeof mod === "string" ? mod : mod.name;
          const desc = typeof mod === "string" ? "" : mod.description;
          const resps = typeof mod === "string" ? [] : mod.responsibilities;
          const safeResps = Array.isArray(resps) ? resps : [];
          return (
            <div className="module-card" key={name ?? `mod-${i}`}>
              <h4>{name}</h4>
              {desc && <p className="module-desc">{desc}</p>}
              {safeResps.length > 0 && (
                <ul className="module-resps">
                  {safeResps.map((resp, ri) => (
                    <li key={ri}>{resp}</li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}

/* ---------- Database tables with DDL generator ---------- */

function DatabaseBlock({ entities, relations }) {
  const [dbTab, setDbTab] = useState("tables");
  const [ddlCopied, setDdlCopied] = useState(false);
  const safe = Array.isArray(entities) ? entities : [];

  // Generate DDL on the fly
  const generateDdl = () => {
    const ddl = [];
    ddl.push("-- ========================================================");
    ddl.push("-- SQL DDL Schema Specification");
    ddl.push(`-- Generated on: ${new Date().toLocaleDateString()}`);
    ddl.push("-- Target: PostgreSQL / Relational Database");
    ddl.push("-- ========================================================");
    ddl.push("");

    safe.forEach((entity) => {
      const tableName = entity.name;
      ddl.push(`-- Table: ${tableName}`);
      if (entity.description) {
        ddl.push(`-- Description: ${entity.description}`);
      }
      ddl.push(`CREATE TABLE ${tableName} (`);

      const colLines = [];
      const cols = Array.isArray(entity.columns) ? entity.columns : [];

      cols.forEach((col) => {
        const colName = col.name;
        let colType = col.type;

        // Clean common type aliases
        if (colType.toLowerCase() === "string") colType = "VARCHAR(255)";
        
        const constraints = Array.isArray(col.constraints) ? col.constraints : [];
        const constraintStr = constraints
          .map((c) => {
            if (c.toUpperCase() === "PK") return "PRIMARY KEY";
            if (c.toUpperCase() === "FK" || c.toUpperCase().startsWith("FK(")) return "";
            return c;
          })
          .filter((c) => c !== "")
          .join(" ");

        colLines.push(`  ${colName} ${colType}${constraintStr ? " " + constraintStr : ""}`);
      });

      // Append table-level Foreign Key Constraints based on relationships
      const tableRelations = Array.isArray(relations) ? relations.filter(r => r.from_table === tableName) : [];
      tableRelations.forEach((rel) => {
        const fkCol = rel.via_column ?? `${rel.to_table}_id`;
        const fkName = `fk_${tableName}_${rel.to_table}`;
        colLines.push(`  CONSTRAINT ${fkName} FOREIGN KEY (${fkCol}) REFERENCES ${rel.to_table}(id) ON DELETE CASCADE`);
      });

      ddl.push(colLines.join(",\n"));
      ddl.push(");");
      ddl.push("");
    });

    return ddl.join("\n");
  };

  const sqlCode = generateDdl();

  const handleCopyDdl = async () => {
    try {
      await navigator.clipboard.writeText(sqlCode);
      setDdlCopied(true);
      setTimeout(() => setDdlCopied(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const tabSwitcher = (
    <div className="diagram-tabs" style={{ marginRight: "10px" }}>
      <button
        className={`diagram-tab ${dbTab === "tables" ? "active" : ""}`}
        type="button"
        onClick={() => setDbTab("tables")}
      >
        <Table2 size={13} />
        Tables
      </button>
      <button
        className={`diagram-tab ${dbTab === "ddl" ? "active" : ""}`}
        type="button"
        onClick={() => setDbTab("ddl")}
      >
        <Code size={13} />
        Export SQL DDL
      </button>
    </div>
  );

  return (
    <CollapsibleSection
      title="Database Schema"
      count={safe.length}
      icon={Database}
      className="wide"
      headerAction={tabSwitcher}
    >
      {safe.length === 0 && <p className="muted-item">No items matching criteria</p>}
      
      {dbTab === "tables" ? (
        <div className="tables-grid">
          {safe.map((entity, i) => {
            const name = typeof entity === "string" ? entity : entity.name;
            const desc = typeof entity === "string" ? "" : entity.description;
            const cols = typeof entity === "string" ? [] : entity.columns;
            const safeCols = Array.isArray(cols) ? cols : [];
            return (
              <div className="db-table-card" key={name ?? `tbl-${i}`}>
                <div className="db-table-name">{name}</div>
                {desc && <p className="db-table-desc">{desc}</p>}
                {safeCols.length > 0 && (
                  <table className="detail-table">
                    <thead>
                      <tr>
                        <th>Column</th>
                        <th>Type</th>
                        <th>Constraints</th>
                      </tr>
                    </thead>
                    <tbody>
                      {safeCols.map((col, ci) => {
                        const cName = typeof col === "string" ? col : col.name;
                        const cType = typeof col === "string" ? "string" : col.type;
                        const constraints =
                          typeof col === "string" ? [] : col.constraints;
                        const safeConstraints = Array.isArray(constraints)
                          ? constraints
                          : [];
                        return (
                          <tr key={cName ?? `col-${ci}`}>
                            <td className="col-name">{cName}</td>
                            <td className="col-type">{cType}</td>
                            <td className="col-constraints">
                              {safeConstraints.map((con, conI) => (
                                <span className="constraint-badge" key={conI}>
                                  {con}
                                </span>
                              ))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ background: "#060913", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "8px", marginBottom: "12px" }}>
            <span style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "var(--text-secondary)" }}>schema.sql</span>
            <button className="icon-button" type="button" onClick={handleCopyDdl} style={{ height: "30px", padding: "4px 10px" }}>
              {ddlCopied ? (
                <>
                  <Check size={13} style={{ color: "#10b981" }} />
                  <span style={{ color: "#10b981", fontSize: "0.75rem" }}>Copied SQL!</span>
                </>
              ) : (
                <>
                  <Copy size={13} />
                  <span style={{ fontSize: "0.75rem" }}>Copy SQL</span>
                </>
              )}
            </button>
          </div>
          <pre style={{ margin: 0, padding: 0, overflowX: "auto", maxHeight: "350px" }}>
            <code style={{ fontFamily: "monospace", fontSize: "0.82rem", color: "#a78bfa", whiteSpace: "pre" }}>{sqlCode}</code>
          </pre>
        </div>
      )}
    </CollapsibleSection>
  );
}

/* ---------- Database relations ---------- */

function RelationsBlock({ relations }) {
  const safe = Array.isArray(relations) ? relations : [];

  return (
    <CollapsibleSection
      title="Database Relations"
      count={safe.length}
      icon={Link2}
      className="wide"
    >
      {safe.length === 0 && <p className="muted-item">No items matching criteria</p>}
      {safe.length > 0 && (
        <table className="detail-table relations-table">
          <thead>
            <tr>
              <th>Source Table</th>
              <th>Relation</th>
              <th>Target Table</th>
              <th>Via Column / Details</th>
            </tr>
          </thead>
          <tbody>
            {safe.map((rel, i) => {
              const src = typeof rel === "string" ? "" : (rel.from_table ?? rel.source ?? "");
              const target = typeof rel === "string" ? "" : (rel.to_table ?? rel.target ?? "");
              const type = typeof rel === "string" ? "" : (rel.relation_type ?? rel.type ?? "");
              const desc =
                typeof rel === "string" ? rel : (rel.via_column ?? rel.description ?? "");
              return (
                <tr key={i}>
                  <td className="col-name">{src}</td>
                  <td>
                    <span className="relation-type-badge">{type}</span>
                  </td>
                  <td className="col-name">{target}</td>
                  <td>{desc}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </CollapsibleSection>
  );
}


/* ---------- API specifications ---------- */

function ApisBlock({ apis }) {
  const safe = Array.isArray(apis) ? apis : [];

  return (
    <CollapsibleSection
      title="API Endpoints"
      count={safe.length}
      icon={Router}
      className="wide"
    >
      {safe.length === 0 && <p className="muted-item">No items matching criteria</p>}
      <div className="apis-list">
        {safe.map((api, i) => {
          const path = typeof api === "string" ? api : api.path;
          const method = typeof api === "string" ? "GET" : api.method;
          const auth = typeof api === "string" ? false : (api.auth_required ?? api.requires_auth);
          const purpose = typeof api === "string" ? "" : api.purpose;
          const desc = typeof api === "string" ? "" : api.description;
          const reqBody = typeof api === "string" ? null : api.request_body;
          const resBody = typeof api === "string" ? null : api.response_body;

          const methodClass = `method-${(method ?? "GET").toLowerCase()}`;
          const hasReq = hasMeaningfulBody(reqBody);
          const hasRes = hasMeaningfulBody(resBody);

          const uniqueId = `${method}-${path}-${i}`;

          return (
            <div className="api-detail" key={uniqueId}>
              <div className="api-header">
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span className={`method-badge ${methodClass}`}>{method}</span>
                  <span className="api-path">{path}</span>
                  <span className={`auth-badge ${auth ? "auth-yes" : "auth-no"}`}>
                    {auth ? "JWT Auth" : "Public"}
                  </span>
                </div>
              </div>
              {purpose && <div className="api-purpose">{purpose}</div>}
              {desc && <p className="api-desc">{desc}</p>}

              {(hasReq || hasRes) && (
                <div
                  className="api-bodies"
                  style={{ gridTemplateColumns: hasReq && hasRes ? "repeat(2, 1fr)" : "1fr" }}
                >
                  {hasReq && (
                    <div className="api-body-block">
                      <span className="body-label">Request Body</span>
                      <code>
                        {typeof reqBody === "object"
                          ? JSON.stringify(reqBody, null, 2)
                          : reqBody}
                      </code>
                    </div>
                  )}
                  {hasRes && (
                    <div className="api-body-block">
                      <span className="body-label">Response Body</span>
                      <code>
                        {typeof resBody === "object"
                          ? JSON.stringify(resBody, null, 2)
                          : resBody}
                      </code>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}

/* ---------- Data flows ---------- */

function FlowsBlock({ flows }) {
  const safe = Array.isArray(flows) ? flows : [];

  return (
    <CollapsibleSection
      title="Data Flows"
      count={safe.length}
      icon={GitBranch}
      className="wide"
    >
      {safe.length === 0 && <p className="muted-item">No items matching criteria</p>}
      <div className="flows-list">
        {safe.map((flow, i) => {
          const src = typeof flow === "string" ? "" : flow.source;
          const target = typeof flow === "string" ? "" : flow.target;
          const label = typeof flow === "string" ? flow : flow.label;
          return (
            <div className="flow-item" key={i}>
              <span className="flow-source">{src}</span>
              <span className="flow-arrow">➔</span>
              <span className="flow-target">{target}</span>
              {label && <span className="flow-label">({label})</span>}
            </div>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}

/* ---------- Tech stack ---------- */

function TechStackBlock({ stack }) {
  const keys = stack ? Object.keys(stack) : [];

  return (
    <CollapsibleSection
      title="Technology Stack"
      count={keys.length}
      icon={Cpu}
      className="wide"
    >
      {keys.length === 0 && <p className="muted-item">No items matching criteria</p>}
      <div className="tech-stack-grid">
        {keys.map((key) => (
          <div className="tech-item" key={key}>
            <span className="tech-key">{key}</span>
            <span className="tech-value">{stack[key]}</span>
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}

/* ---------- Main details card ---------- */

export default function ArchitectureCard({ result }) {
  const [jsonCopied, setJsonCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  if (!result) {
    return (
      <section className="empty-state">
        <h2>Ready when your requirements are.</h2>
        <p>
          The first implementation generates structured analysis, architecture
          modules, API suggestions, risks, and a Mermaid diagram.
        </p>
      </section>
    );
  }

  const analysis = result.analysis ?? {};
  const architecture = result.architecture ?? {};

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      setJsonCopied(true);
      setTimeout(() => setJsonCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy JSON: ", err);
    }
  };

  // Instant filter query
  const query = searchQuery.trim().toLowerCase();

  const filteredActors = (analysis.actors ?? []).filter((item) =>
    item.toLowerCase().includes(query)
  );
  const filteredFeatures = (analysis.features ?? []).filter((item) =>
    item.toLowerCase().includes(query)
  );
  const filteredAssumptions = (analysis.assumptions ?? []).filter((item) =>
    item.toLowerCase().includes(query)
  );
  const filteredMissing = (analysis.missing_requirements ?? []).filter((item) =>
    item.toLowerCase().includes(query)
  );

  const filteredModules = (architecture.modules ?? []).filter((mod) => {
    const name = typeof mod === "string" ? mod : mod.name;
    const desc = typeof mod === "string" ? "" : mod.description;
    const resps = typeof mod === "string" ? [] : mod.responsibilities;
    return (
      name.toLowerCase().includes(query) ||
      desc.toLowerCase().includes(query) ||
      resps.some((r) => r.toLowerCase().includes(query))
    );
  });

  const filteredEntities = (architecture.database_entities ?? []).filter((entity) => {
    const name = typeof entity === "string" ? entity : entity.name;
    const desc = typeof entity === "string" ? "" : entity.description;
    const cols = typeof entity === "string" ? [] : entity.columns;
    return (
      name.toLowerCase().includes(query) ||
      desc.toLowerCase().includes(query) ||
      cols.some((c) => {
        const cName = typeof c === "string" ? c : c.name;
        const cType = typeof c === "string" ? "" : c.type;
        return cName.toLowerCase().includes(query) || cType.toLowerCase().includes(query);
      })
    );
  });

  const filteredRelations = (architecture.database_relations ?? []).filter((rel) => {
    const src = typeof rel === "string" ? "" : (rel.from_table ?? rel.source ?? "");
    const target = typeof rel === "string" ? "" : (rel.to_table ?? rel.target ?? "");
    const type = typeof rel === "string" ? "" : (rel.relation_type ?? rel.type ?? "");
    const desc =
      typeof rel === "string" ? rel : (rel.via_column ?? rel.description ?? "");
    return (
      src.toLowerCase().includes(query) ||
      target.toLowerCase().includes(query) ||
      type.toLowerCase().includes(query) ||
      desc.toLowerCase().includes(query)
    );
  });

  const filteredApis = (architecture.apis ?? []).filter((api) => {
    const path = typeof api === "string" ? api : api.path;
    const method = typeof api === "string" ? "GET" : api.method;
    const purpose = typeof api === "string" ? "" : api.purpose;
    const desc = typeof api === "string" ? "" : api.description;
    return (
      path.toLowerCase().includes(query) ||
      method.toLowerCase().includes(query) ||
      purpose.toLowerCase().includes(query) ||
      desc.toLowerCase().includes(query)
    );
  });

  const filteredFlows = (architecture.data_flows ?? []).filter((flow) => {
    const src = typeof flow === "string" ? "" : flow.source;
    const target = typeof flow === "string" ? "" : flow.target;
    const label = typeof flow === "string" ? flow : flow.label;
    return (
      src.toLowerCase().includes(query) ||
      target.toLowerCase().includes(query) ||
      label.toLowerCase().includes(query)
    );
  });

  // Filter tech stack keys
  const techStack = architecture.tech_stack ?? {};
  const filteredTechStack = {};
  Object.keys(techStack).forEach((key) => {
    if (key.toLowerCase().includes(query) || techStack[key].toLowerCase().includes(query)) {
      filteredTechStack[key] = techStack[key];
    }
  });

  const filteredExternals = (architecture.external_services ?? []).filter((item) =>
    item.toLowerCase().includes(query)
  );
  const filteredRisks = (architecture.risks ?? []).filter((item) =>
    item.toLowerCase().includes(query)
  );

  return (
    <div>
      {/* Top Search and JSON Actions */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "18px",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: "260px" }}>
          <input
            type="text"
            placeholder="Search architecture modules, APIs, database tables..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 14px",
              background: "#0b111e",
              border: "1px solid var(--border-color)",
              borderRadius: "8px",
              color: "var(--text-primary)",
              fontSize: "0.85rem",
              outline: "none",
              transition: "border-color 0.2s ease",
            }}
            onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--border-color)")}
          />
        </div>

        <button
          className="icon-button"
          type="button"
          onClick={handleCopyJson}
          title="Copy full response as JSON"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "0.82rem",
            padding: "6px 12px",
            height: "36px",
          }}
        >
          {jsonCopied ? (
            <>
              <Check size={14} style={{ color: "#10b981" }} />
              Copied JSON
            </>
          ) : (
            <>
              <Copy size={14} />
              Copy JSON
            </>
          )}
        </button>
      </div>

      <section className="results-grid">
        <ListBlock title="Actors" icon={Boxes} items={filteredActors} />
        <ListBlock title="Features" icon={Boxes} items={filteredFeatures} />
        <ListBlock title="Assumptions" icon={Boxes} items={filteredAssumptions} />
        <ListBlock title="Missing Requirements" icon={ShieldAlert} items={filteredMissing} />

        <ModulesBlock modules={filteredModules} />
        <DatabaseBlock entities={filteredEntities} relations={filteredRelations} />
        <RelationsBlock relations={filteredRelations} />
        <ApisBlock apis={filteredApis} />
        <FlowsBlock flows={filteredFlows} />
        <TechStackBlock stack={filteredTechStack} />

        <ListBlock title="External Integrations" icon={Plug} items={filteredExternals} />
        <ListBlock title="Risks" icon={ShieldAlert} items={filteredRisks} />

        <CollapsibleSection title="Deployment" icon={Boxes} className="wide">
          <p>{architecture.deployment_style}</p>
        </CollapsibleSection>
      </section>
    </div>
  );
}
