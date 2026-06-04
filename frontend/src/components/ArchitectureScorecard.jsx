import { useState, useEffect } from "react";
import { Award, ShieldCheck, Zap, HeartPulse, Hammer, ChevronDown } from "lucide-react";

export default function ArchitectureScorecard({ result }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!result || !result.architecture) return null;

  const arch = result.architecture;
  const apis = arch.apis ?? [];
  const entities = arch.database_entities ?? [];
  const tech = arch.tech_stack ?? {};
  const deployment = arch.deployment_style ?? "";

  // 1. Calculate Security Score
  let securityScore = 55;
  const recommendations = [];

  if (tech.auth && tech.auth !== "none") {
    securityScore += 15;
  } else {
    recommendations.push({
      metric: "Security",
      text: "No authentication mechanism specified in the tech stack. Add JWT, OAuth, or Session Auth.",
      impact: "+15 pts",
    });
  }

  const authApis = apis.filter((a) => a.requires_auth);
  if (apis.length > 0) {
    const authRatio = authApis.length / apis.length;
    if (authRatio > 0.6) {
      securityScore += 15;
    } else if (authRatio > 0) {
      securityScore += 8;
      recommendations.push({
        metric: "Security",
        text: `Only ${Math.round(authRatio * 100)}% of API endpoints require authentication. Audit and restrict sensitive routes.`,
        impact: "+7 pts",
      });
    }
  }

  const hasHttpsOrSsl = deployment.toLowerCase().includes("ssl") || deployment.toLowerCase().includes("https") || deployment.toLowerCase().includes("cloudflare");
  if (hasHttpsOrSsl) {
    securityScore += 15;
  } else {
    recommendations.push({
      metric: "Security",
      text: "Deployment strategy does not explicitly mention SSL/HTTPS termination. Enforce encrypted traffic.",
      impact: "+15 pts",
    });
  }

  // Cap at 100
  securityScore = Math.min(securityScore, 100);

  // 2. Calculate Scalability Score
  let scalabilityScore = 50;
  
  const hasCache = tech.cache && tech.cache.toLowerCase() !== "none" && tech.cache !== "";
  if (hasCache) {
    scalabilityScore += 20;
  } else {
    recommendations.push({
      metric: "Scalability",
      text: "No caching layer (like Redis or Memcached) is defined. Cache frequent read database queries.",
      impact: "+20 pts",
    });
  }

  const lowerDeploy = deployment.toLowerCase();
  const isCloudScale = lowerDeploy.includes("kubernetes") || lowerDeploy.includes("k8s") || lowerDeploy.includes("ecs") || lowerDeploy.includes("autoscaling") || lowerDeploy.includes("serverless") || lowerDeploy.includes("load balancer");
  if (isCloudScale) {
    scalabilityScore += 20;
  } else {
    recommendations.push({
      metric: "Scalability",
      text: "Deployment architecture lacks load balancing or auto-scaling configurations. Switch to an auto-scaling cloud engine.",
      impact: "+20 pts",
    });
  }

  const hasCdn = lowerDeploy.includes("cdn") || lowerDeploy.includes("cloudfront") || lowerDeploy.includes("cloudflare");
  if (hasCdn) {
    scalabilityScore += 10;
  } else {
    recommendations.push({
      metric: "Scalability",
      text: "CDN (Content Delivery Network) is missing for static assets. Implement Cloudflare or CloudFront.",
      impact: "+10 pts",
    });
  }
  scalabilityScore = Math.min(scalabilityScore, 100);

  // 3. Calculate Maintainability Score
  let maintainabilityScore = 60;
  
  // Good modularization
  if ((arch.modules ?? []).length >= 5) {
    maintainabilityScore += 15;
  } else {
    recommendations.push({
      metric: "Maintainability",
      text: "System is modularized into few services. Separate concerns into distinct functional modules.",
      impact: "+15 pts",
    });
  }

  // Tables detail
  const tablesWithDesc = entities.filter(e => e.description && e.description.length > 5);
  if (entities.length > 0 && (tablesWithDesc.length / entities.length) > 0.8) {
    maintainabilityScore += 15;
  } else {
    recommendations.push({
      metric: "Maintainability",
      text: "Database tables lack descriptive summaries. Document table definitions to improve team onboarding.",
      impact: "+15 pts",
    });
  }

  // Relations defined
  if ((arch.database_relations ?? []).length > 2) {
    maintainabilityScore += 10;
  } else {
    recommendations.push({
      metric: "Maintainability",
      text: "Few relationships mapped between entities. Define foreign key connections to ensure data integrity.",
      impact: "+10 pts",
    });
  }
  maintainabilityScore = Math.min(maintainabilityScore, 100);

  // 4. Calculate Robustness Score (Resilience & Error Handling)
  let robustnessScore = 55;
  
  if ((arch.risks ?? []).length >= 5) {
    robustnessScore += 20;
  } else {
    recommendations.push({
      metric: "Robustness",
      text: "Few system design risks identified. Audit edge cases, security exploits, and concurrency issues.",
      impact: "+20 pts",
    });
  }

  const hasDbBackups = lowerDeploy.includes("backup") || lowerDeploy.includes("replication") || lowerDeploy.includes("snapshot") || lowerDeploy.includes("multi-az");
  if (hasDbBackups) {
    robustnessScore += 25;
  } else {
    recommendations.push({
      metric: "Robustness",
      text: "Database replication or automatic snapshots are not mentioned. Add database backup strategy to deployment.",
      impact: "+25 pts",
    });
  }
  robustnessScore = Math.min(robustnessScore, 100);

  // Compute Overall Score
  const overallScore = Math.round((securityScore + scalabilityScore + maintainabilityScore + robustnessScore) / 4);

  // Determine Letter Grade
  let grade = "C";
  let gradeColor = "#f59e0b"; // orange
  if (overallScore >= 95) { grade = "A+"; gradeColor = "#10b981"; }
  else if (overallScore >= 90) { grade = "A"; gradeColor = "#10b981"; }
  else if (overallScore >= 85) { grade = "B+"; gradeColor = "#3b82f6"; }
  else if (overallScore >= 80) { grade = "B"; gradeColor = "#3b82f6"; }
  else if (overallScore >= 70) { grade = "C+"; gradeColor = "#f59e0b"; }
  else if (overallScore >= 60) { grade = "C"; gradeColor = "#f59e0b"; }
  else { grade = "D"; gradeColor = "#ef4444"; }

  return (
    <section className="result-block wide" style={{ border: "1px solid var(--border-hover)", background: "rgba(30, 41, 59, 0.2)" }}>
      <div className="section-heading action-heading" style={{ borderBottom: "1px solid var(--border-color)", paddingBottom: "14px", marginBottom: "18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Award size={18} style={{ color: "var(--accent-cyan)" }} />
          <h3 style={{ margin: 0 }}>Design Quality Scorecard</h3>
          <span className="section-count" style={{ background: "rgba(6, 182, 212, 0.15)", color: "#22d3ee", borderColor: "rgba(6, 182, 212, 0.3)" }}>Interactive</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: "24px", alignItems: "center" }}>
        {/* Left Side Grade Ring */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
          <div style={{
            position: "relative",
            width: "100px",
            height: "100px",
            borderRadius: "50%",
            border: `5px solid rgba(255,255,255,0.05)`,
            borderTopColor: gradeColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 0 20px ${gradeColor}22`
          }}>
            <span style={{ fontSize: "2rem", fontWeight: "800", color: gradeColor }}>{grade}</span>
          </div>
          <span style={{ fontSize: "0.85rem", fontWeight: "700", color: "var(--text-secondary)", marginTop: "10px" }}>{overallScore} / 100</span>
          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Architecture Rating</span>
        </div>

        {/* Right Side Progress Bars */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* Security */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", marginBottom: "4px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-primary)" }}>
                <ShieldCheck size={14} style={{ color: "#10b981" }} />
                Security
              </span>
              <span style={{ fontWeight: "700", color: "#10b981" }}>{securityScore}%</span>
            </div>
            <div style={{ height: "6px", background: "rgba(255,255,255,0.04)", borderRadius: "3px", overflow: "hidden" }}>
              <div style={{ width: `${securityScore}%`, height: "100%", background: "#10b981", borderRadius: "3px" }}></div>
            </div>
          </div>

          {/* Scalability */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", marginBottom: "4px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-primary)" }}>
                <Zap size={14} style={{ color: "#38bdf8" }} />
                Scalability & Performance
              </span>
              <span style={{ fontWeight: "700", color: "#38bdf8" }}>{scalabilityScore}%</span>
            </div>
            <div style={{ height: "6px", background: "rgba(255,255,255,0.04)", borderRadius: "3px", overflow: "hidden" }}>
              <div style={{ width: `${scalabilityScore}%`, height: "100%", background: "#38bdf8", borderRadius: "3px" }}></div>
            </div>
          </div>

          {/* Maintainability */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", marginBottom: "4px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-primary)" }}>
                <Hammer size={14} style={{ color: "#a78bfa" }} />
                Code Maintainability
              </span>
              <span style={{ fontWeight: "700", color: "#a78bfa" }}>{maintainabilityScore}%</span>
            </div>
            <div style={{ height: "6px", background: "rgba(255,255,255,0.04)", borderRadius: "3px", overflow: "hidden" }}>
              <div style={{ width: `${maintainabilityScore}%`, height: "100%", background: "#a78bfa", borderRadius: "3px" }}></div>
            </div>
          </div>

          {/* Robustness */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", marginBottom: "4px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-primary)" }}>
                <HeartPulse size={14} style={{ color: "#ec4899" }} />
                Fault Tolerance & Robustness
              </span>
              <span style={{ fontWeight: "700", color: "#ec4899" }}>{robustnessScore}%</span>
            </div>
            <div style={{ height: "6px", background: "rgba(255,255,255,0.04)", borderRadius: "3px", overflow: "hidden" }}>
              <div style={{ width: `${robustnessScore}%`, height: "100%", background: "#ec4899", borderRadius: "3px" }}></div>
            </div>
          </div>
        </div>
      </div>

      {/* Recommendations collapsible list */}
      {recommendations.length > 0 && (
        <div style={{ marginTop: "20px", borderTop: "1px solid var(--border-color)", paddingTop: "14px" }}>
          <div
            onClick={() => setIsExpanded(!isExpanded)}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", userSelect: "none" }}
          >
            <span style={{ fontSize: "0.85rem", fontWeight: "700", color: "var(--text-secondary)" }}>
              Improvement Recommendations ({recommendations.length})
            </span>
            <ChevronDown
              size={16}
              style={{
                transition: "transform 0.3s ease",
                transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                color: "var(--text-muted)"
              }}
            />
          </div>
          
          <div style={{
            maxHeight: isExpanded ? "400px" : "0px",
            overflow: "hidden",
            transition: "max-height 0.3s ease"
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "12px" }}>
              {recommendations.map((rec, index) => (
                <div key={index} style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "rgba(255,255,255,0.015)",
                  border: "1px solid rgba(255,255,255,0.03)",
                  borderRadius: "6px",
                  padding: "8px 12px",
                  fontSize: "0.8rem"
                }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontSize: "0.68rem", fontWeight: "700", textTransform: "uppercase", color: rec.metric === "Security" ? "#10b981" : rec.metric === "Scalability" ? "#38bdf8" : rec.metric === "Maintainability" ? "#a78bfa" : "#ec4899" }}>
                      {rec.metric}
                    </span>
                    <span style={{ color: "var(--text-secondary)" }}>{rec.text}</span>
                  </div>
                  <span style={{ fontWeight: "700", color: "#10b981", fontSize: "0.78rem" }}>{rec.impact}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
