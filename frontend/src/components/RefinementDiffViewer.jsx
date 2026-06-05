import { useState } from "react";
import {
  Boxes,
  Database,
  Router,
  ShieldAlert,
  Plus,
  Minus,
  ArrowRight,
  GitBranch,
} from "lucide-react";

export default function RefinementDiffViewer({ initial, refined }) {
  const [activeTab, setActiveTab] = useState("modules");

  if (!initial || !refined) return null;

  // ----------------------------------------------------
  // Diff Calculation Helpers
  // ----------------------------------------------------

  const initialModules = initial.modules ?? [];
  const refinedModules = refined.modules ?? [];

  const initialEntities = initial.database_entities ?? [];
  const refinedEntities = refined.database_entities ?? [];

  const initialApis = initial.apis ?? [];
  const refinedApis = refined.apis ?? [];

  const initialRisks = initial.risks ?? [];
  const refinedRisks = refined.risks ?? [];

  // --- 1. Modules Diff ---
  const moduleChanges = [];
  const initialModMap = new Map(initialModules.map((m) => [m.name, m]));
  const refinedModMap = new Map(refinedModules.map((m) => [m.name, m]));

  // Find added & modified
  refinedModules.forEach((rm) => {
    const im = initialModMap.get(rm.name);
    if (!im) {
      moduleChanges.push({ type: "added", name: rm.name, data: rm });
    } else {
      // Check responsibilities differences
      const iResps = im.responsibilities ?? [];
      const rResps = rm.responsibilities ?? [];
      const addedResps = rResps.filter((r) => !iResps.includes(r));
      const removedResps = iResps.filter((r) => !rResps.includes(r));
      const descChanged = im.description !== rm.description;

      if (addedResps.length > 0 || removedResps.length > 0 || descChanged) {
        moduleChanges.push({
          type: "modified",
          name: rm.name,
          oldData: im,
          newData: rm,
          addedResps,
          removedResps,
          descChanged,
        });
      }
    }
  });
  // Find removed
  initialModules.forEach((im) => {
    if (!refinedModMap.has(im.name)) {
      moduleChanges.push({ type: "removed", name: im.name, data: im });
    }
  });

  // --- 2. Database Schema Diff ---
  const databaseChanges = [];
  const initialEntMap = new Map(initialEntities.map((e) => [e.name, e]));
  const refinedEntMap = new Map(refinedEntities.map((e) => [e.name, e]));

  // Find added & modified tables
  refinedEntities.forEach((re) => {
    const ie = initialEntMap.get(re.name);
    if (!ie) {
      databaseChanges.push({ type: "added", name: re.name, data: re });
    } else {
      // Compare columns
      const iCols = ie.columns ?? [];
      const rCols = re.columns ?? [];
      const iColMap = new Map(iCols.map((c) => [c.name, c]));
      const rColMap = new Map(rCols.map((c) => [c.name, c]));

      const addedCols = rCols.filter((c) => !iColMap.has(c.name));
      const removedCols = iCols.filter((c) => !rColMap.has(c.name));
      
      const modifiedCols = [];
      rCols.forEach((rc) => {
        const ic = iColMap.get(rc.name);
        if (ic && (ic.type !== rc.type || JSON.stringify(ic.constraints) !== JSON.stringify(rc.constraints))) {
          modifiedCols.push({ name: rc.name, oldCol: ic, newCol: rc });
        }
      });

      if (addedCols.length > 0 || removedCols.length > 0 || modifiedCols.length > 0 || ie.description !== re.description) {
        databaseChanges.push({
          type: "modified",
          name: re.name,
          addedCols,
          removedCols,
          modifiedCols,
          descChanged: ie.description !== re.description,
          oldDesc: ie.description,
          newDesc: re.description,
        });
      }
    }
  });
  // Find removed tables
  initialEntities.forEach((ie) => {
    if (!refinedEntMap.has(ie.name)) {
      databaseChanges.push({ type: "removed", name: ie.name, data: ie });
    }
  });

  // --- 3. APIs Diff ---
  const apiChanges = [];
  const getApiKey = (a) => `${a.method} ${a.path}`;
  const initialApiMap = new Map(initialApis.map((a) => [getApiKey(a), a]));
  const refinedApiMap = new Map(refinedApis.map((a) => [getApiKey(a), a]));

  refinedApis.forEach((ra) => {
    const key = getApiKey(ra);
    const ia = initialApiMap.get(key);
    if (!ia) {
      apiChanges.push({ type: "added", key, data: ra });
    } else {
      const authChanged = ia.auth_required !== ra.auth_required;
      const descChanged = ia.description !== ra.description;
      const reqChanged = ia.request_body !== ra.request_body;
      const resChanged = ia.response_body !== ra.response_body;

      if (authChanged || descChanged || reqChanged || resChanged) {
        apiChanges.push({
          type: "modified",
          key,
          oldData: ia,
          newData: ra,
          authChanged,
          descChanged,
          reqChanged,
          resChanged,
        });
      }
    }
  });
  initialApis.forEach((ia) => {
    const key = getApiKey(ia);
    if (!refinedApiMap.has(key)) {
      apiChanges.push({ type: "removed", key, data: ia });
    }
  });

  // --- 4. Risks Diff ---
  const riskChanges = [];
  refinedRisks.forEach((rr) => {
    if (!initialRisks.includes(rr)) {
      riskChanges.push({ type: "added", text: rr });
    }
  });
  initialRisks.forEach((ir) => {
    if (!refinedRisks.includes(ir)) {
      riskChanges.push({ type: "removed", text: ir });
    }
  });

  // Count total differences
  const totalDiffs =
    moduleChanges.length +
    databaseChanges.length +
    apiChanges.length +
    riskChanges.length;

  return (
    <div className="diff-viewer panel" style={{ marginTop: "16px", animation: "fadeInUp 0.3s ease-out" }}>
      {/* Diff Header */}
      <div className="diff-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: "14px", marginBottom: "18px" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.3rem", display: "flex", alignItems: "center", gap: "8px" }}>
            <GitBranch size={19} style={{ color: "var(--accent)" }} />
            Architecture Refinement Audit
          </h2>
          <p style={{ margin: "4px 0 0 0", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
            Reviewing structural improvements made during the multi-agent critic self-correction loop.
          </p>
        </div>
        <span className="section-count" style={{ fontSize: "0.8rem", padding: "4px 10px", background: "rgba(34, 197, 94, 0.12)", color: "#4ade80", borderColor: "rgba(34, 197, 94, 0.3)" }}>
          {totalDiffs === 0 ? "No structural changes" : `${totalDiffs} changes detected`}
        </span>
      </div>

      {/* Tab Controls */}
      <div className="diff-tabs" style={{ display: "flex", gap: "8px", marginBottom: "18px", borderBottom: "1px solid rgba(255,255,255,0.03)", paddingBottom: "8px" }}>
        <button
          className={`tab-btn ${activeTab === "modules" ? "active" : ""}`}
          onClick={() => setActiveTab("modules")}
          style={{ display: "flex", alignItems: "center", gap: "6px", background: activeTab === "modules" ? "rgba(255,255,255,0.05)" : "transparent", border: "none", padding: "8px 14px", borderRadius: "6px", cursor: "pointer", color: activeTab === "modules" ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: "600", fontSize: "0.85rem" }}
        >
          <Boxes size={15} />
          Modules
          <span style={{ fontSize: "0.72rem", background: "rgba(255,255,255,0.08)", padding: "1px 6px", borderRadius: "10px" }}>{moduleChanges.length}</span>
        </button>
        <button
          className={`tab-btn ${activeTab === "database" ? "active" : ""}`}
          onClick={() => setActiveTab("database")}
          style={{ display: "flex", alignItems: "center", gap: "6px", background: activeTab === "database" ? "rgba(255,255,255,0.05)" : "transparent", border: "none", padding: "8px 14px", borderRadius: "6px", cursor: "pointer", color: activeTab === "database" ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: "600", fontSize: "0.85rem" }}
        >
          <Database size={15} />
          Database Schema
          <span style={{ fontSize: "0.72rem", background: "rgba(255,255,255,0.08)", padding: "1px 6px", borderRadius: "10px" }}>{databaseChanges.length}</span>
        </button>
        <button
          className={`tab-btn ${activeTab === "apis" ? "active" : ""}`}
          onClick={() => setActiveTab("apis")}
          style={{ display: "flex", alignItems: "center", gap: "6px", background: activeTab === "apis" ? "rgba(255,255,255,0.05)" : "transparent", border: "none", padding: "8px 14px", borderRadius: "6px", cursor: "pointer", color: activeTab === "apis" ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: "600", fontSize: "0.85rem" }}
        >
          <Router size={15} />
          APIs
          <span style={{ fontSize: "0.72rem", background: "rgba(255,255,255,0.08)", padding: "1px 6px", borderRadius: "10px" }}>{apiChanges.length}</span>
        </button>
        <button
          className={`tab-btn ${activeTab === "risks" ? "active" : ""}`}
          onClick={() => setActiveTab("risks")}
          style={{ display: "flex", alignItems: "center", gap: "6px", background: activeTab === "risks" ? "rgba(255,255,255,0.05)" : "transparent", border: "none", padding: "8px 14px", borderRadius: "6px", cursor: "pointer", color: activeTab === "risks" ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: "600", fontSize: "0.85rem" }}
        >
          <ShieldAlert size={15} />
          Risks
          <span style={{ fontSize: "0.72rem", background: "rgba(255,255,255,0.08)", padding: "1px 6px", borderRadius: "10px" }}>{riskChanges.length}</span>
        </button>
      </div>

      {/* Tab Panels */}
      <div className="diff-panel-content">
        {totalDiffs === 0 && (
          <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)", fontSize: "0.9rem" }}>
            The initial architecture draft was production-ready! No structural changes were needed.
          </div>
        )}

        {/* ── MODULES TAB ── */}
        {activeTab === "modules" && moduleChanges.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {moduleChanges.map((ch, idx) => (
              <div
                key={idx}
                style={{
                  border: "1px solid var(--border-color)",
                  borderRadius: "8px",
                  padding: "14px",
                  background:
                    ch.type === "added"
                      ? "rgba(34, 197, 94, 0.03)"
                      : ch.type === "removed"
                      ? "rgba(239, 68, 68, 0.03)"
                      : "rgba(255,255,255,0.01)",
                  borderColor:
                    ch.type === "added"
                      ? "rgba(34, 197, 94, 0.15)"
                      : ch.type === "removed"
                      ? "rgba(239, 68, 68, 0.15)"
                      : "var(--border-color)",
                }}
              >
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <span style={{ fontWeight: "700", color: "var(--text-primary)" }}>
                    {ch.name}
                  </span>
                  <span
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: "700",
                      textTransform: "uppercase",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      background:
                        ch.type === "added"
                          ? "rgba(34, 197, 94, 0.15)"
                          : ch.type === "removed"
                          ? "rgba(239, 68, 68, 0.15)"
                          : "rgba(245, 158, 11, 0.15)",
                      color:
                        ch.type === "added"
                          ? "#4ade80"
                          : ch.type === "removed"
                          ? "#f87171"
                          : "#fbbf24",
                    }}
                  >
                    {ch.type}
                  </span>
                </div>

                {/* Description */}
                {(ch.type === "added" || ch.type === "removed") && (
                  <p style={{ margin: "4px 0", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    {ch.data?.description}
                  </p>
                )}

                {ch.type === "modified" && (
                  <div>
                    {ch.descChanged && (
                      <div style={{ fontSize: "0.8rem", marginBottom: "8px" }}>
                        <span style={{ color: "var(--text-muted)" }}>Description updated:</span>
                        <div style={{ textDecoration: "line-through", color: "#f87171" }}>{ch.oldData.description}</div>
                        <div style={{ color: "#4ade80" }}>{ch.newData.description}</div>
                      </div>
                    )}

                    {/* Modified Responsibilities */}
                    {(ch.addedResps.length > 0 || ch.removedResps.length > 0) && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "8px" }}>
                        <span style={{ fontSize: "0.72rem", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)" }}>
                          Responsibilities Changes:
                        </span>
                        {ch.removedResps.map((r, i) => (
                          <div key={`rem-${i}`} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", color: "#fca5a5" }}>
                            <Minus size={12} />
                            <span style={{ textDecoration: "line-through" }}>{r}</span>
                          </div>
                        ))}
                        {ch.addedResps.map((r, i) => (
                          <div key={`add-${i}`} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", color: "#86efac" }}>
                            <Plus size={12} />
                            <span>{r}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── DATABASE SCHEMA TAB ── */}
        {activeTab === "database" && databaseChanges.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {databaseChanges.map((ch, idx) => (
              <div
                key={idx}
                style={{
                  border: "1px solid var(--border-color)",
                  borderRadius: "8px",
                  padding: "14px",
                  background:
                    ch.type === "added"
                      ? "rgba(34, 197, 94, 0.03)"
                      : ch.type === "removed"
                      ? "rgba(239, 68, 68, 0.03)"
                      : "rgba(255,255,255,0.01)",
                  borderColor:
                    ch.type === "added"
                      ? "rgba(34, 197, 94, 0.15)"
                      : ch.type === "removed"
                      ? "rgba(239, 68, 68, 0.15)"
                      : "var(--border-color)",
                }}
              >
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <span style={{ fontFamily: "monospace", fontWeight: "700", color: "var(--text-primary)", fontSize: "0.9rem" }}>
                    Table: {ch.name}
                  </span>
                  <span
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: "700",
                      textTransform: "uppercase",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      background:
                        ch.type === "added"
                          ? "rgba(34, 197, 94, 0.15)"
                          : ch.type === "removed"
                          ? "rgba(239, 68, 68, 0.15)"
                          : "rgba(245, 158, 11, 0.15)",
                      color:
                        ch.type === "added"
                          ? "#4ade80"
                          : ch.type === "removed"
                          ? "#f87171"
                          : "#fbbf24",
                    }}
                  >
                    {ch.type}
                  </span>
                </div>

                {/* Table Content */}
                {(ch.type === "added" || ch.type === "removed") && (
                  <div>
                    {ch.data?.description && (
                      <p style={{ margin: "4px 0 8px 0", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                        {ch.data.description}
                      </p>
                    )}
                    {/* Columns preview */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                      {(ch.data?.columns ?? []).map((col, cidx) => (
                        <span
                          key={cidx}
                          style={{
                            fontFamily: "monospace",
                            fontSize: "0.72rem",
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.06)",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            color: ch.type === "added" ? "#86efac" : "#fca5a5",
                          }}
                        >
                          {col.name} ({col.type})
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {ch.type === "modified" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {ch.descChanged && (
                      <div style={{ fontSize: "0.8rem" }}>
                        <span style={{ color: "var(--text-muted)" }}>Description updated:</span>
                        <div style={{ textDecoration: "line-through", color: "#f87171" }}>{ch.oldDesc}</div>
                        <div style={{ color: "#4ade80" }}>{ch.newDesc}</div>
                      </div>
                    )}

                    {/* Columns diff details */}
                    {(ch.addedCols.length > 0 || ch.removedCols.length > 0 || ch.modifiedCols.length > 0) && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span style={{ fontSize: "0.72rem", fontWeight: "700", textTransform: "uppercase", color: "var(--text-muted)" }}>
                          Columns Changes:
                        </span>
                        {ch.removedCols.map((col, i) => (
                          <div key={`c-rem-${i}`} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", color: "#fca5a5", fontFamily: "monospace" }}>
                            <Minus size={12} />
                            <span style={{ textDecoration: "line-through" }}>{col.name} ({col.type})</span>
                          </div>
                        ))}
                        {ch.modifiedCols.map((cDiff, i) => (
                          <div key={`c-mod-${i}`} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", color: "#fbbf24", fontFamily: "monospace" }}>
                            <ArrowRight size={12} />
                            <span>
                              {cDiff.name}: {cDiff.oldCol.type} &rarr; {cDiff.newCol.type}{" "}
                              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                                ({cDiff.newCol.constraints.join(", ") || "no constraints"})
                              </span>
                            </span>
                          </div>
                        ))}
                        {ch.addedCols.map((col, i) => (
                          <div key={`c-add-${i}`} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", color: "#86efac", fontFamily: "monospace" }}>
                            <Plus size={12} />
                            <span>{col.name} ({col.type})</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── APIS TAB ── */}
        {activeTab === "apis" && apiChanges.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {apiChanges.map((ch, idx) => (
              <div
                key={idx}
                style={{
                  border: "1px solid var(--border-color)",
                  borderRadius: "8px",
                  padding: "14px",
                  background:
                    ch.type === "added"
                      ? "rgba(34, 197, 94, 0.03)"
                      : ch.type === "removed"
                      ? "rgba(239, 68, 68, 0.03)"
                      : "rgba(255,255,255,0.01)",
                  borderColor:
                    ch.type === "added"
                      ? "rgba(34, 197, 94, 0.15)"
                      : ch.type === "removed"
                      ? "rgba(239, 68, 68, 0.15)"
                      : "var(--border-color)",
                }}
              >
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <span style={{ fontFamily: "monospace", fontWeight: "700", color: "var(--text-primary)", fontSize: "0.88rem" }}>
                    {ch.key}
                  </span>
                  <span
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: "700",
                      textTransform: "uppercase",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      background:
                        ch.type === "added"
                          ? "rgba(34, 197, 94, 0.15)"
                          : ch.type === "removed"
                          ? "rgba(239, 68, 68, 0.15)"
                          : "rgba(245, 158, 11, 0.15)",
                      color:
                        ch.type === "added"
                          ? "#4ade80"
                          : ch.type === "removed"
                          ? "#f87171"
                          : "#fbbf24",
                    }}
                  >
                    {ch.type}
                  </span>
                </div>

                {/* API Info */}
                {(ch.type === "added" || ch.type === "removed") && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    <p style={{ margin: "2px 0" }}><strong>Purpose:</strong> {ch.data?.purpose}</p>
                    {ch.data?.description && <p style={{ margin: "2px 0" }}><strong>Description:</strong> {ch.data.description}</p>}
                    <p style={{ margin: "2px 0", color: "var(--text-muted)" }}>
                      Auth required: {ch.data?.auth_required ? "Yes" : "No"}
                    </p>
                  </div>
                )}

                {ch.type === "modified" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.8rem" }}>
                    {ch.descChanged && (
                      <div>
                        <span style={{ color: "var(--text-muted)" }}>Description updated:</span>
                        <div style={{ textDecoration: "line-through", color: "#f87171" }}>{ch.oldData.description}</div>
                        <div style={{ color: "#4ade80" }}>{ch.newData.description}</div>
                      </div>
                    )}

                    {ch.authChanged && (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ color: "var(--text-muted)" }}>Authentication:</span>
                        <span style={{ textDecoration: "line-through", color: "#f87171" }}>{ch.oldData.auth_required ? "Required" : "Public"}</span>
                        <ArrowRight size={12} style={{ color: "var(--text-muted)" }} />
                        <span style={{ color: "#4ade80" }}>{ch.newData.auth_required ? "Required" : "Public"}</span>
                      </div>
                    )}

                    {ch.reqChanged && (
                      <div>
                        <span style={{ color: "var(--text-muted)" }}>Request Payload updated:</span>
                        <div style={{ fontFamily: "monospace", fontSize: "0.75rem", padding: "4px 8px", background: "rgba(255,255,255,0.015)", borderRadius: "4px" }}>
                          <span style={{ textDecoration: "line-through", color: "#fca5a5" }}>{ch.oldData.request_body}</span>
                          <span style={{ margin: "0 6px", color: "var(--text-muted)" }}>&rarr;</span>
                          <span style={{ color: "#86efac" }}>{ch.newData.request_body}</span>
                        </div>
                      </div>
                    )}

                    {ch.resChanged && (
                      <div>
                        <span style={{ color: "var(--text-muted)" }}>Response payload updated:</span>
                        <div style={{ fontFamily: "monospace", fontSize: "0.75rem", padding: "4px 8px", background: "rgba(255,255,255,0.015)", borderRadius: "4px" }}>
                          <span style={{ textDecoration: "line-through", color: "#fca5a5" }}>{ch.oldData.response_body}</span>
                          <span style={{ margin: "0 6px", color: "var(--text-muted)" }}>&rarr;</span>
                          <span style={{ color: "#86efac" }}>{ch.newData.response_body}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── RISKS TAB ── */}
        {activeTab === "risks" && riskChanges.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {riskChanges.map((ch, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  padding: "10px 14px",
                  borderRadius: "6px",
                  background: ch.type === "added" ? "rgba(34, 197, 94, 0.03)" : "rgba(239, 68, 68, 0.03)",
                  border: "1px solid",
                  borderColor: ch.type === "added" ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
                  fontSize: "0.82rem",
                }}
              >
                {ch.type === "added" ? (
                  <Plus size={14} style={{ color: "#4ade80", flexShrink: 0, marginTop: "2px" }} />
                ) : (
                  <Minus size={14} style={{ color: "#f87171", flexShrink: 0, marginTop: "2px" }} />
                )}
                <span
                  style={{
                    color: ch.type === "added" ? "var(--text-primary)" : "var(--text-secondary)",
                    textDecoration: ch.type === "removed" ? "line-through" : "none",
                  }}
                >
                  {ch.text}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
