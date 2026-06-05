import { useState, useEffect } from "react";
import {
  Boxes,
  Database,
  Router,
  GitBranch,
  ShieldCheck,
  ShieldAlert,
  Plug,
  Lock,
} from "lucide-react";

/* ── Animated counter hook ───────────────────────────────────── */

function useAnimatedCount(target, duration = 700) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target === 0) {
      setCount(0);
      return;
    }
    let start = 0;
    const increment = target / (duration / 16);
    const timer = setInterval(() => {
      start += increment;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return count;
}

/* ── Single stat tile ────────────────────────────────────────── */

function StatTile({ icon: Icon, label, value, suffix = "", color, subtext }) {
  const animatedValue = useAnimatedCount(typeof value === "number" ? value : 0);

  return (
    <div className="stat-tile">
      <div className="stat-tile-icon" style={{ color, background: `${color}14` }}>
        <Icon size={18} />
      </div>
      <div className="stat-tile-body">
        <span className="stat-tile-value" style={{ color }}>
          {typeof value === "number" ? animatedValue : value}
          {suffix}
        </span>
        <span className="stat-tile-label">{label}</span>
        {subtext && <span className="stat-tile-sub">{subtext}</span>}
      </div>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────── */

export default function ArchitectureStats({ result }) {
  if (!result || !result.architecture) return null;

  const arch = result.architecture;
  const analysis = result.analysis ?? {};

  const modules = arch.modules ?? [];
  const entities = arch.database_entities ?? [];
  const apis = arch.apis ?? [];
  const flows = arch.data_flows ?? [];
  const risks = arch.risks ?? [];
  const externals = arch.external_services ?? [];

  // Auth coverage
  const authApis = apis.filter((a) => a.auth_required || a.requires_auth);
  const authPct = apis.length > 0 ? Math.round((authApis.length / apis.length) * 100) : 0;

  // Total columns across all entities
  const totalColumns = entities.reduce((sum, e) => {
    const cols = typeof e === "string" ? [] : (e.columns ?? []);
    return sum + cols.length;
  }, 0);

  // Determine auth coverage health
  let authColor = "#ef4444"; // red
  let authLabel = "Low";
  if (authPct >= 80) { authColor = "#10b981"; authLabel = "Strong"; }
  else if (authPct >= 50) { authColor = "#f59e0b"; authLabel = "Moderate"; }

  return (
    <div className="arch-stats-bar">
      <StatTile
        icon={Boxes}
        label="Modules"
        value={modules.length}
        color="#3b82f6"
        subtext={`${(analysis.features ?? []).length} features`}
      />
      <StatTile
        icon={Database}
        label="DB Tables"
        value={entities.length}
        color="#38bdf8"
        subtext={`${totalColumns} columns`}
      />
      <StatTile
        icon={Router}
        label="API Endpoints"
        value={apis.length}
        color="#8b5cf6"
        subtext={`${authApis.length} protected`}
      />
      <StatTile
        icon={GitBranch}
        label="Data Flows"
        value={flows.length}
        color="#06b6d4"
      />
      <StatTile
        icon={Lock}
        label="Auth Coverage"
        value={authPct}
        suffix="%"
        color={authColor}
        subtext={authLabel}
      />
      <StatTile
        icon={ShieldAlert}
        label="Risks Found"
        value={risks.length}
        color={risks.length >= 5 ? "#10b981" : "#f59e0b"}
        subtext={risks.length >= 5 ? "Well audited" : "Needs review"}
      />
      <StatTile
        icon={Plug}
        label="Integrations"
        value={externals.length}
        color="#a855f7"
      />
    </div>
  );
}
