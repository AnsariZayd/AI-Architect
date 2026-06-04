import { useCallback, useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import {
  Check,
  Copy,
  Download,
  Maximize2,
  Minimize2,
  Minus,
  Network,
  Plus,
  RotateCcw,
  Table2,
} from "lucide-react";

mermaid.initialize({
  startOnLoad: false,
  theme: "base",
  securityLevel: "strict",
  themeVariables: {
    primaryColor: "#1e293b",
    primaryTextColor: "#f8fafc",
    primaryBorderColor: "#38bdf8",
    lineColor: "#64748b",
    secondaryColor: "#0f172a",
    tertiaryColor: "#0b0f19",
  },
  themeCSS: `
    .er.entityBox { fill: #1e293b !important; stroke: #38bdf8 !important; stroke-width: 1.5px !important; }
    .er.entityLabel { fill: #38bdf8 !important; font-weight: 700 !important; }
    .er.attributeBoxEven { fill: #0b1329 !important; stroke: rgba(255, 255, 255, 0.08) !important; }
    .er.attributeBoxOdd { fill: #111a36 !important; stroke: rgba(255, 255, 255, 0.08) !important; }
    .er.relationshipLabel { fill: #f8fafc !important; }
    .er.relationshipLabelBox { fill: #1e293b !important; stroke: #38bdf8 !important; }
    .er.relationshipLine { stroke: #64748b !important; stroke-width: 1.5px !important; }
    .er text, .er text *, .er tspan, .er .attributeText, .er .labelText, .er [class*="labelText"], .er [class*="attributeText"] { fill: #e2e8f0 !important; color: #e2e8f0 !important; font-family: Inter, sans-serif !important; }
  `,
});

const MIN_SCALE = 0.1;
const MAX_SCALE = 8;
const SCALE_STEP = 0.15;

export default function DiagramViewer({ code, erCode }) {
  const containerRef = useRef(null);
  const [activeTab, setActiveTab] = useState("architecture");
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const panStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  const activeCode = activeTab === "architecture" ? code : erCode;

  // Reset view when diagram or tab changes
  useEffect(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, [activeCode]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      if (!containerRef.current || !activeCode) {
        return;
      }

      const id = `diagram-${Date.now()}`;
      try {
        const { svg } = await mermaid.render(id, activeCode);
        if (!cancelled) {
          containerRef.current.innerHTML = svg;
        }
      } catch (err) {
        console.error("Mermaid parsing error:", err);
        // Suppress visual noise on screen, but show clean feedback
        if (!cancelled) {
          containerRef.current.innerHTML = `<div class="error-message">Failed to render Mermaid diagram. Please verify the code structure.</div>`;
        }
      }
    }

    renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [activeCode]);

  const zoomIn = () => setScale((s) => Math.min(s + SCALE_STEP, MAX_SCALE));
  const zoomOut = () => setScale((s) => Math.max(s - SCALE_STEP, MIN_SCALE));
  const resetView = () => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  };

  const fitToView = useCallback(() => {
    if (!containerRef.current) return;
    const svg = containerRef.current.querySelector("svg");
    const surface = containerRef.current.closest(".diagram-surface");
    if (!svg || !surface) return;

    // Get current dimensions, adjusting for current scale to find natural dimensions
    const svgRect = svg.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();

    const naturalWidth = svgRect.width / scale;
    const naturalHeight = svgRect.height / scale;

    const wScale = (surfaceRect.width - 40) / naturalWidth;
    const hScale = (surfaceRect.height - 40) / naturalHeight;
    const nextScale = Math.max(MIN_SCALE, Math.min(wScale, hScale, 1.2)); // Cap at 1.2x natural

    setScale(nextScale);
    // Center it
    setTranslate({
      x: (surfaceRect.width - naturalWidth * nextScale) / 2,
      y: (surfaceRect.height - naturalHeight * nextScale) / 2,
    });
  }, [scale]);

  const handleWheel = (e) => {
    e.preventDefault();
    const scaleFactor = 1.05;
    const nextScale = e.deltaY < 0 
      ? Math.min(scale * scaleFactor, MAX_SCALE)
      : Math.max(scale / scaleFactor, MIN_SCALE);
    
    // Zoom towards cursor (relative to surface)
    const surface = e.currentTarget.getBoundingClientRect();
    const cursorX = e.clientX - surface.left;
    const cursorY = e.clientY - surface.top;

    // Calculate natural coords under mouse before scale change
    const naturalX = (cursorX - translate.x) / scale;
    const naturalY = (cursorY - translate.y) / scale;

    // New translation to keep same point under cursor
    const nextTx = cursorX - naturalX * nextScale;
    const nextTy = cursorY - naturalY * nextScale;

    setScale(nextScale);
    setTranslate({ x: nextTx, y: nextTy });
  };

  const handleMouseDown = (e) => {
    // Only left click initiates pan
    if (e.button !== 0) return;
    setIsPanning(true);
    panStart.current = {
      x: e.clientX,
      y: e.clientY,
      tx: translate.x,
      ty: translate.y,
    };
  };

  const handleMouseMove = useCallback(
    (e) => {
      if (!isPanning) return;
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setTranslate({
        x: panStart.current.tx + dx,
        y: panStart.current.ty + dy,
      });
    },
    [isPanning]
  );

  const handleMouseUpOrLeave = useCallback(() => {
    setIsPanning(false);
  }, []);

  useEffect(() => {
    if (isPanning) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUpOrLeave);
    } else {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUpOrLeave);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUpOrLeave);
    };
  }, [isPanning, handleMouseMove, handleMouseUpOrLeave]);

  const handleCopyCode = async () => {
    if (!activeCode) return;
    try {
      await navigator.clipboard.writeText(activeCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code: ", err);
    }
  };

  const handleDownloadSvg = () => {
    if (!containerRef.current) return;
    const svgEl = containerRef.current.querySelector("svg");
    if (!svgEl) return;
    
    const clonedSvg = svgEl.cloneNode(true);
    clonedSvg.removeAttribute("style"); // strip inline transform scale/translate styles
    clonedSvg.setAttribute("width", "100%");
    clonedSvg.setAttribute("height", "100%");
    
    const svgData = new XMLSerializer().serializeToString(clonedSvg);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);
    const downloadLink = document.createElement("a");
    downloadLink.href = svgUrl;
    downloadLink.download = `${activeTab}-diagram.svg`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(svgUrl);
  };

  const hasArchitecture = !!code;
  const hasEr = !!erCode;

  return (
    <section className={`panel diagram-panel ${isFullscreen ? "fullscreen" : ""}`}>
      <div className="section-heading action-heading">
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {hasArchitecture && hasEr && (
            <div className="diagram-tabs">
              <button
                className={`diagram-tab ${activeTab === "architecture" ? "active" : ""}`}
                type="button"
                onClick={() => setActiveTab("architecture")}
                disabled={!hasArchitecture}
              >
                <Network size={15} aria-hidden="true" />
                Architecture Diagram
              </button>
              <button
                className={`diagram-tab ${activeTab === "er" ? "active" : ""}`}
                type="button"
                onClick={() => setActiveTab("er")}
                disabled={!hasEr}
              >
                <Table2 size={15} aria-hidden="true" />
                ER Diagram
              </button>
            </div>
          )}
          {(!hasArchitecture || !hasEr) && (
            <>
              <Network size={18} aria-hidden="true" />
              <h2>{activeTab === "er" ? "ER Diagram" : "Architecture Diagram"}</h2>
            </>
          )}
        </div>

        {activeCode && (
          <div className="zoom-controls">
            {/* Copy button */}
            <button
              className="zoom-btn copy-btn-diagram"
              type="button"
              onClick={handleCopyCode}
              title="Copy Mermaid Code"
              style={{ position: "relative" }}
            >
              {copied ? <Check size={16} style={{ color: "#10b981" }} /> : <Copy size={16} />}
              {copied && <span className="tooltip">Copied!</span>}
            </button>

            {/* Download SVG button */}
            <button
              className="zoom-btn"
              type="button"
              onClick={handleDownloadSvg}
              title="Download SVG"
            >
              <Download size={16} />
            </button>

            <span className="zoom-separator">|</span>

            {/* Zoom controls */}
            <button className="zoom-btn" type="button" onClick={zoomOut} title="Zoom out">
              <Minus size={16} />
            </button>
            <span className="zoom-level">{Math.round(scale * 100)}%</span>
            <button className="zoom-btn" type="button" onClick={zoomIn} title="Zoom in">
              <Plus size={16} />
            </button>
            <button className="zoom-btn" type="button" onClick={fitToView} title="Fit to view">
              <Maximize2 size={16} />
            </button>
            <button className="zoom-btn" type="button" onClick={resetView} title="Reset view">
              <RotateCcw size={16} />
            </button>

            <span className="zoom-separator">|</span>

            {/* Fullscreen toggle button */}
            <button
              className="zoom-btn"
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Mode"}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
        )}
      </div>

      <div
        className={`diagram-surface ${isPanning ? "panning" : ""}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
      >
        <div
          className="diagram-transform"
          ref={containerRef}
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transformOrigin: "center center",
          }}
        >
          {!activeCode && <p className="muted-item">Generated Mermaid diagram will appear here.</p>}
        </div>
      </div>
    </section>
  );
}
