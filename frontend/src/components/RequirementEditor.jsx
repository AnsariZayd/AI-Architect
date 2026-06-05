import { useState, useRef } from "react";
import { FileText, Send, Trash2, Upload, AlertCircle, Square } from "lucide-react";
import { API_BASE_URL } from "../services/api.js";

export default function RequirementEditor({
  value,
  onChange,
  onSubmit,
  onStop,
  isLoading,
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef(null);

  const charCount = value.length;

  const handleKeyDown = (event) => {
    if (event.ctrlKey && event.key === "Enter") {
      if (!isLoading && value.trim().length >= 10) {
        event.preventDefault();
        onSubmit();
      }
    }
  };

  const handleClear = () => {
    onChange("");
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset value so selection of same file triggers onChange again
    event.target.value = "";
    setIsUploading(true);
    setUploadError("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`${API_BASE_URL}/api/generate/parse-file`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errText = await response.text();
        let errMsg = `Upload failed with status ${response.status}`;
        try {
          const errJson = JSON.parse(errText);
          if (errJson.detail) errMsg = errJson.detail;
        } catch (e) {}
        throw new Error(errMsg);
      }

      const data = await response.json();
      if (data.text) {
        onChange(data.text);
      }
    } catch (err) {
      setUploadError(err.message || "Failed to parse file");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <section className="panel input-panel">
      <div className="section-heading action-heading">
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <FileText size={18} aria-hidden="true" />
          <h2>Requirements</h2>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <span className="muted-item" style={{ fontSize: "0.8rem" }}>
            {charCount} characters
          </span>
          
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".txt,.pdf"
            style={{ display: "none" }}
          />
          
          <button
            className="icon-button"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isUploading}
            title="Upload requirements (.txt, .pdf)"
            style={{ padding: "6px 10px", display: "flex", alignItems: "center", gap: "4px" }}
          >
            {isUploading ? (
              <span className="spinner" style={{ width: "14px", height: "14px", border: "2px solid rgba(255,255,255,0.2)", borderTopColor: "var(--accent)" }} />
            ) : (
              <Upload size={15} aria-hidden="true" />
            )}
            <span style={{ fontSize: "0.78rem" }}>Upload File</span>
          </button>

          {value.length > 0 && (
            <button
              className="icon-button"
              type="button"
              onClick={handleClear}
              disabled={isLoading || isUploading}
              title="Clear text"
              style={{ padding: "6px" }}
            >
              <Trash2 size={15} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {uploadError && (
        <div style={{
          background: "rgba(239, 68, 68, 0.1)",
          border: "1px solid rgba(239, 68, 68, 0.2)",
          borderRadius: "6px",
          padding: "8px 12px",
          marginBottom: "12px",
          fontSize: "0.82rem",
          color: "#f87171",
          display: "flex",
          alignItems: "center",
          gap: "8px"
        }}>
          <AlertCircle size={15} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{uploadError}</span>
          <button 
            type="button" 
            onClick={() => setUploadError("")}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "1.1rem", padding: "0 4px", lineHeight: 1 }}
          >
            &times;
          </button>
        </div>
      )}

      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Paste project requirements here or upload a .txt/.pdf file... (min 10 characters)"
        spellCheck="true"
        disabled={isLoading || isUploading}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px" }}>
        <span className="muted-item" style={{ fontSize: "0.75rem" }}>
          Press <kbd style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", padding: "2px 5px", borderRadius: "3px", color: "var(--accent)" }}>Ctrl + Enter</kbd> to generate
        </span>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {isLoading && (
            <button
              className="danger-button"
              type="button"
              onClick={onStop}
              title="Stop generation"
            >
              <Square size={14} fill="currentColor" aria-hidden="true" />
              Stop
            </button>
          )}
          <button
            className="primary-button"
            type="button"
            onClick={onSubmit}
            disabled={isLoading || isUploading || value.trim().length < 10}
          >
            {isLoading ? (
              <>
                <span className="spinner" style={{ marginRight: "8px" }} />
                Generating...
              </>
            ) : (
              <>
                <Send size={17} style={{ marginRight: "6px" }} aria-hidden="true" />
                Generate Architecture
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}

