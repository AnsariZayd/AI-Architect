import { useEffect, useState } from "react";
import { Activity, Download, Sparkles, Copy, Check, Database, Sun, Moon } from "lucide-react";

import ArchitectureCard from "../components/ArchitectureCard.jsx";
import DiagramViewer from "../components/DiagramViewer.jsx";
import RequirementEditor from "../components/RequirementEditor.jsx";
import BoilerplateViewer from "../components/BoilerplateViewer.jsx";
import {
  API_BASE_URL,
  createProject,
  generateArchitecture,
  getHealth,
} from "../services/api.js";

const starterRequirements = `Build a web-based Tic Tac Toe game.
- The game should support two players playing turn-by-turn on the same screen (X and O).
- Track the current game state, validate win conditions (horizontal, vertical, diagonal), and detect draws.
- Allow users to reset the game board to start a new round.
- Keep a history of player wins and losses locally.`;

function LoadingSkeleton() {
  return (
    <div className="results-grid">
      <div className="result-block loading-shimmer" style={{ height: "180px", border: "1px dashed rgba(255,255,255,0.1)" }}></div>
      <div className="result-block loading-shimmer" style={{ height: "180px", border: "1px dashed rgba(255,255,255,0.1)" }}></div>
      <div className="result-block loading-shimmer" style={{ height: "180px", border: "1px dashed rgba(255,255,255,0.1)" }}></div>
      <div className="result-block loading-shimmer" style={{ height: "180px", border: "1px dashed rgba(255,255,255,0.1)" }}></div>
      <div className="result-block wide loading-shimmer" style={{ height: "260px", border: "1px dashed rgba(255,255,255,0.1)" }}></div>
      <div className="result-block wide loading-shimmer" style={{ height: "300px", border: "1px dashed rgba(255,255,255,0.1)" }}></div>
    </div>
  );
}

export default function Project() {
  const [requirements, setRequirements] = useState(starterRequirements);
  const [project, setProject] = useState(null);
  const [result, setResult] = useState(null);
  const [health, setHealth] = useState("checking");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [runInfo, setRunInfo] = useState(null);
  const [summaryCopied, setSummaryCopied] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");

  useEffect(() => {
    if (theme === "light") {
      document.body.classList.add("light-mode");
    } else {
      document.body.classList.remove("light-mode");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    getHealth()
      .then(() => setHealth("online"))
      .catch(() => setHealth("offline"));
  }, []);

  async function handleGenerate() {
    setError("");
    setIsLoading(true);
    setResult(null);
    const startedAt = performance.now();

    const milestones = [
      "Analyzing requirements and identifying core actors...",
      "Decomposing system and designing core modules...",
      "Modeling database schemas and relationships...",
      "Designing REST API endpoints and payload specs...",
      "Analyzing architectural risks and identifying gaps...",
      "Refining module boundaries and database schemas...",
      "Performing final architectural verification and synthesis...",
    ];

    setRunInfo({ status: milestones[0] });

    let milestoneIndex = 0;
    const milestoneInterval = setInterval(() => {
      if (milestoneIndex < milestones.length - 1) {
        milestoneIndex++;
        setRunInfo({ status: milestones[milestoneIndex] });
      }
    }, 6500);

    try {
      const activeProject =
        project ??
        (await createProject({
          name: "Architecture Draft",
          description: "Generated from requirement text",
        }));
      setProject(activeProject);

      const architecture = await generateArchitecture({
        project_id: activeProject.id,
        requirements,
      });
      setResult(architecture);
      setRunInfo({
        status: "Generation complete",
        durationMs: Math.round(performance.now() - startedAt),
        source: architecture.generation_source,
        persisted: architecture.persisted,
        version: architecture.version,
      });
    } catch (caughtError) {
      setError(caughtError.message);
      setRunInfo({ status: "Generation failed" });
    } finally {
      clearInterval(milestoneInterval);
      setIsLoading(false);
    }
  }

  function downloadJson() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "architecture-draft.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copySummaryToClipboard() {
    if (!result) return;
    try {
      const summary = `
AI Software Architect Summary:
- Actors: ${(result.analysis?.actors ?? []).join(", ") || "None"}
- Modules: ${(result.architecture?.modules ?? []).map(m => typeof m === "string" ? m : m.name).join(", ") || "None"}
- Tech Stack: ${Object.entries(result.architecture?.tech_stack ?? {}).map(([k, v]) => `${k}: ${v}`).join(", ") || "None"}
- APIs Count: ${(result.architecture?.apis ?? []).length}
- DB Tables: ${(result.architecture?.database_entities ?? []).map(t => typeof t === "string" ? t : t.name).join(", ") || "None"}
      `.trim();
      await navigator.clipboard.writeText(summary);
      setSummaryCopied(true);
      setTimeout(() => setSummaryCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  }

  function downloadMarkdown() {
    if (!result) {
      return;
    }

    const analysis = result.analysis ?? {};
    const architecture = result.architecture ?? {};

    const md = [];
    md.push("# AI Software Architecture Draft");
    md.push("");
    md.push(`*Generated on ${new Date().toLocaleDateString()}*`);
    md.push("");

    md.push("## Original Requirements");
    md.push("```text");
    md.push(requirements);
    md.push("```");
    md.push("");

    md.push("## 1. Analysis");
    md.push("");

    md.push("### Actors");
    const actors = Array.isArray(analysis.actors) ? analysis.actors : [];
    if (actors.length) {
      actors.forEach((act) => md.push(`- **${act}**`));
    } else {
      md.push("_None specified_");
    }
    md.push("");

    md.push("### Features");
    const features = Array.isArray(analysis.features) ? analysis.features : [];
    if (features.length) {
      features.forEach((feat) => md.push(`- ${feat}`));
    } else {
      md.push("_None specified_");
    }
    md.push("");

    md.push("### Assumptions");
    const assumptions = Array.isArray(analysis.assumptions) ? analysis.assumptions : [];
    if (assumptions.length) {
      assumptions.forEach((ass) => md.push(`- ${ass}`));
    } else {
      md.push("_None specified_");
    }
    md.push("");

    md.push("### Missing Requirements");
    const missing = Array.isArray(analysis.missing_requirements) ? analysis.missing_requirements : [];
    if (missing.length) {
      missing.forEach((ms) => md.push(`- [ ] ${ms}`));
    } else {
      md.push("_None identified_");
    }
    md.push("");

    md.push("## 2. Architecture Modules");
    md.push("");
    const modules = Array.isArray(architecture.modules) ? architecture.modules : [];
    if (modules.length) {
      modules.forEach((mod) => {
        const name = typeof mod === "string" ? mod : mod.name;
        const desc = typeof mod === "string" ? "" : mod.description;
        const resps = typeof mod === "string" ? [] : mod.responsibilities;
        md.push(`### ${name}`);
        if (desc) md.push(desc);
        if (resps.length) {
          md.push("");
          md.push("**Responsibilities:**");
          resps.forEach((r) => md.push(`- ${r}`));
        }
        md.push("");
      });
    } else {
      md.push("_None specified_");
      md.push("");
    }

    md.push("## 3. Database Schema");
    md.push("");
    const entities = Array.isArray(architecture.database_entities) ? architecture.database_entities : [];
    if (entities.length) {
      entities.forEach((ent) => {
        const name = typeof ent === "string" ? ent : ent.name;
        const desc = typeof ent === "string" ? "" : ent.description;
        const cols = typeof ent === "string" ? [] : ent.columns;
        md.push(`### Table: \`${name}\``);
        if (desc) md.push(desc);
        md.push("");
        if (cols.length) {
          md.push("| Column | Type | Constraints |");
          md.push("| --- | --- | --- |");
          cols.forEach((col) => {
            const cName = typeof col === "string" ? col : col.name;
            const cType = typeof col === "string" ? "string" : col.type;
            const consts = typeof col === "string" ? [] : col.constraints;
            md.push(`| \`${cName}\` | \`${cType}\` | ${consts.join(", ") || "-"} |`);
          });
          md.push("");
        }
      });
    } else {
      md.push("_None specified_");
      md.push("");
    }

    md.push("### Relations");
    const relations = Array.isArray(architecture.database_relations) ? architecture.database_relations : [];
    if (relations.length) {
      md.push("| Source Table | Relation | Target Table | Description |");
      md.push("| --- | --- | --- | --- |");
      relations.forEach((rel) => {
        const src = typeof rel === "string" ? "" : rel.source;
        const type = typeof rel === "string" ? "" : rel.type;
        const target = typeof rel === "string" ? "" : rel.target;
        const d = typeof rel === "string" ? rel : rel.description;
        md.push(`| \`${src}\` | **${type}** | \`${target}\` | ${d} |`);
      });
      md.push("");
    } else {
      md.push("_None specified_");
      md.push("");
    }

    md.push("## 4. API Specification");
    md.push("");
    const apis = Array.isArray(architecture.apis) ? architecture.apis : [];
    if (apis.length) {
      apis.forEach((api) => {
        const path = typeof api === "string" ? api : api.path;
        const method = typeof api === "string" ? "GET" : api.method;
        const auth = typeof api === "string" ? false : api.requires_auth;
        const purpose = typeof api === "string" ? "" : api.purpose;
        const desc = typeof api === "string" ? "" : api.description;
        const reqB = typeof api === "string" ? null : api.request_body;
        const resB = typeof api === "string" ? null : api.response_body;

        md.push(`### \`${method}\` ${path}`);
        md.push(`- **Auth:** ${auth ? "Requires Authentication" : "Public"}`);
        if (purpose) md.push(`- **Purpose:** ${purpose}`);
        if (desc) md.push(`- **Description:** ${desc}`);
        md.push("");
        if (reqB) {
          md.push("**Request Body:**");
          md.push("```json");
          md.push(typeof reqB === "object" ? JSON.stringify(reqB, null, 2) : reqB);
          md.push("```");
          md.push("");
        }
        if (resB) {
          md.push("**Response Body:**");
          md.push("```json");
          md.push(typeof resB === "object" ? JSON.stringify(resB, null, 2) : resB);
          md.push("```");
          md.push("");
        }
      });
    } else {
      md.push("_None specified_");
      md.push("");
    }

    md.push("## 5. Data Flows");
    md.push("");
    const flows = Array.isArray(architecture.data_flows) ? architecture.data_flows : [];
    if (flows.length) {
      flows.forEach((fl) => {
        const src = typeof fl === "string" ? "" : fl.source;
        const target = typeof fl === "string" ? "" : fl.target;
        const label = typeof fl === "string" ? fl : fl.label;
        md.push(`- \`${src}\` ➔ \`${target}\` ${label ? `(${label})` : ""}`);
      });
      md.push("");
    } else {
      md.push("_None specified_");
      md.push("");
    }

    md.push("## 6. Technology Stack");
    md.push("");
    const tech = architecture.tech_stack ?? {};
    const techKeys = Object.keys(tech);
    if (techKeys.length) {
      techKeys.forEach((k) => {
        md.push(`- **${k}:** ${tech[k]}`);
      });
      md.push("");
    } else {
      md.push("_None specified_");
      md.push("");
    }

    md.push("## 7. External Integrations");
    md.push("");
    const externals = Array.isArray(architecture.external_services) ? architecture.external_services : [];
    if (externals.length) {
      externals.forEach((ext) => md.push(`- ${ext}`));
      md.push("");
    } else {
      md.push("_None specified_");
      md.push("");
    }

    md.push("## 8. Risks and Mitigation");
    md.push("");
    const risks = Array.isArray(architecture.risks) ? architecture.risks : [];
    if (risks.length) {
      risks.forEach((rk) => md.push(`- ${rk}`));
      md.push("");
    } else {
      md.push("_None identified_");
      md.push("");
    }

    md.push("## 9. Deployment Style");
    md.push("");
    md.push(architecture.deployment_style || "_Not specified_");
    md.push("");

    if (result.mermaid_code) {
      md.push("## 10. Architecture Diagram (Mermaid)");
      md.push("```mermaid");
      md.push(result.mermaid_code);
      md.push("```");
      md.push("");
    }

    if (result.er_diagram_code) {
      md.push("## 11. Entity Relationship Diagram (Mermaid)");
      md.push("```mermaid");
      md.push(result.er_diagram_code);
      md.push("```");
      md.push("");
    }

    const markdownText = md.join("\n");
    const blob = new Blob([markdownText], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "architecture-specification.md";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="header-content">
          <div className="header-badge-container">
            <span className="premium-badge">
              AI Software Architect v2.0
            </span>
          </div>
          <h1 className="main-title">
            Turn Rough Requirements <br className="desktop-only" />
            into a <span className="highlight-text">Production-Ready Spec</span>.
          </h1>
          <p className="header-subtitle">
            Paste your functional specs or upload documents. Our multi-agent system analyzes, 
            models database entities, designs REST APIs, and builds interactive diagrams.
          </p>
        </div>
        <div className="header-controls">
          <button
            className="icon-button theme-toggle-btn"
            type="button"
            onClick={() => setTheme(t => t === "light" ? "dark" : "light")}
            title={`Switch to ${theme === "light" ? "Dark" : "Light"} Mode`}
            style={{ borderRadius: "50%", width: "36px", height: "36px", padding: 0, display: "flex", justifyContent: "center", alignItems: "center" }}
          >
            {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <div className={`status-pill ${health}`}>
            <Activity size={16} aria-hidden="true" />
            API {health} · {API_BASE_URL}
          </div>
        </div>
      </header>

      <section className="workspace">
        <RequirementEditor
          value={requirements}
          onChange={setRequirements}
          onSubmit={handleGenerate}
          isLoading={isLoading}
        />

        <section className="panel output-panel">
          <div className="section-heading action-heading">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Sparkles size={18} aria-hidden="true" />
              <h2>Architecture Draft</h2>
            </div>
            {result && (
              <div style={{ display: "flex", gap: "8px" }}>
                {/* Download Markdown */}
                <button
                  className="icon-button"
                  type="button"
                  onClick={downloadMarkdown}
                  title="Download Markdown Specification"
                >
                  <Download size={17} aria-hidden="true" />
                  <span className="btn-text">Markdown</span>
                </button>
                {/* Download JSON */}
                <button
                  className="icon-button"
                  type="button"
                  onClick={downloadJson}
                  title="Download JSON Spec"
                >
                  <Database size={17} aria-hidden="true" />
                  <span className="btn-text">JSON</span>
                </button>
                {/* Copy Summary */}
                <button
                  className="icon-button"
                  type="button"
                  onClick={copySummaryToClipboard}
                  title="Copy Summary to Clipboard"
                >
                  {summaryCopied ? (
                    <>
                      <Check size={17} aria-hidden="true" style={{ color: "#10b981" }} />
                      <span className="btn-text" style={{ color: "#10b981" }}>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={17} aria-hidden="true" />
                      <span className="btn-text">Copy Summary</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
          {error && <p className="error-message">{error}</p>}
          {runInfo && (
            <div className="run-info">
              <span>{runInfo.status}</span>
              {runInfo.durationMs && <span>{runInfo.durationMs} ms</span>}
              {runInfo.source && <span>{runInfo.source}</span>}
              {typeof runInfo.persisted === "boolean" && (
                <span>{runInfo.persisted ? `Stored v${runInfo.version}` : "Not stored"}</span>
              )}
            </div>
          )}
          {isLoading ? (
            <LoadingSkeleton />
          ) : (
            <>
              <ArchitectureCard result={result} />
              <BoilerplateViewer result={result} />
            </>
          )}
        </section>

        <DiagramViewer code={result?.mermaid_code} erCode={result?.er_diagram_code} />
      </section>
    </main>
  );
}
