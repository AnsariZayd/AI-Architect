import { useState } from "react";
import { 
  Check, 
  Clipboard, 
  Download, 
  Code, 
  FileCode, 
  Server, 
  Terminal, 
  Folder, 
  File, 
  ChevronDown, 
  ChevronRight,
  FolderOpen
} from "lucide-react";
import { API_BASE_URL } from "../services/api.js";

function TreeItem({ item }) {
  const [isOpen, setIsOpen] = useState(true);

  const toggle = (e) => {
    if (item.isFolder) {
      e.stopPropagation();
      setIsOpen(!isOpen);
    }
  };

  return (
    <div style={{ userSelect: "none" }}>
      <div 
        onClick={toggle} 
        style={{ 
          display: "flex", 
          alignItems: "center", 
          gap: "8px", 
          padding: "4px 6px", 
          borderRadius: "4px", 
          cursor: item.isFolder ? "pointer" : "default",
          transition: "background-color 0.15s ease",
        }}
        className="tree-item-row"
      >
        {item.isFolder ? (
          <>
            <span style={{ color: "var(--text-muted)", display: "inline-flex", width: "16px", justifyContent: "center" }}>
              {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </span>
            <Folder size={15} style={{ color: "#3b82f6", fill: "rgba(59, 130, 246, 0.1)" }} />
            <span style={{ fontWeight: "500", color: "var(--text-main)", fontSize: "0.85rem" }}>{item.name}</span>
          </>
        ) : (
          <>
            <span style={{ width: "16px" }} />
            <File size={15} style={{ color: "var(--text-muted)" }} />
            <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>{item.name}</span>
          </>
        )}
      </div>
      {item.isFolder && isOpen && item.children && (
        <div style={{ 
          borderLeft: "1px solid var(--border-color)", 
          marginLeft: "14px", 
          paddingLeft: "8px",
          display: "flex",
          flexDirection: "column",
          gap: "2px"
        }}>
          {item.children.map((child, idx) => (
            <TreeItem key={idx} item={child} />
          ))}
        </div>
      )}
    </div>
  );
}

function DirectoryTree({ data }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
      {data.map((item, idx) => (
        <TreeItem key={idx} item={item} />
      ))}
    </div>
  );
}

export default function BoilerplateViewer({ result }) {
  const [activeFile, setActiveFile] = useState("readme");
  const [copied, setCopied] = useState(false);
  const [isZipping, setIsZipping] = useState(false);

  if (!result || !result.architecture) return null;

  const stack = result.architecture.tech_stack ?? {};
  const modules = result.architecture.modules ?? [];
  const entities = result.architecture.database_entities ?? [];

  // Detect tech types
  const techString = JSON.stringify(stack).toLowerCase();
  const isPython = techString.includes("python") || techString.includes("fastapi") || techString.includes("django") || techString.includes("flask");
  const isNode = techString.includes("node") || techString.includes("express") || techString.includes("nest") || techString.includes("javascript") || techString.includes("typescript");
  
  let dbType = "postgres";
  if (techString.includes("mysql")) dbType = "mysql";
  else if (techString.includes("mongo")) dbType = "mongodb";
  else if (techString.includes("sqlite")) dbType = "sqlite";

  // 1. Generate Dockerfile
  const dockerfile = isPython
    ? `FROM python:3.11-slim

# Prevent Python from writing pyc files and buffering stdout
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \\
    build-essential \\
    libpq-dev \\
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy project files
COPY . .

EXPOSE 8000

# Start app using Uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]`
    : isNode
    ? `FROM node:18-alpine

WORKDIR /app

# Install package dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application files
COPY . .

EXPOSE 3000

# Start server
CMD ["node", "src/index.js"]`
    : `FROM alpine:latest

# Install dependencies
RUN apk add --no-cache curl ca-certificates

WORKDIR /app

# Copy application files
COPY . .

# Adjust startup port
EXPOSE 8080

CMD ["echo", "Start application boilerplate script"]`;

  // 2. Generate docker-compose.yml
  let composeDbSection = "";
  let dbEnv = "";

  if (dbType === "postgres") {
    composeDbSection = `  db:
    image: postgres:15-alpine
    container_name: app_db
    environment:
      POSTGRES_DB: app_db
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d app_db"]
      interval: 10s
      timeout: 5s
      retries: 5`;
    dbEnv = `      - DATABASE_URL=postgresql://postgres:password@db:5432/app_db`;
  } else if (dbType === "mysql") {
    composeDbSection = `  db:
    image: mysql:8.0
    container_name: app_db
    environment:
      MYSQL_DATABASE: app_db
      MYSQL_ROOT_PASSWORD: password
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5`;
    dbEnv = `      - DATABASE_URL=mysql://root:password@db:3306/app_db`;
  } else if (dbType === "mongodb") {
    composeDbSection = `  db:
    image: mongo:6.0
    container_name: app_db
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db`;
    dbEnv = `      - DATABASE_URL=mongodb://db:27017/app_db`;
  }

  const dockerCompose = `version: '3.8'

services:
  web:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: app_web
    ports:
      - "${isPython ? "8000:8000" : isNode ? "3000:3000" : "8080:8080"}"
    environment:
      - PORT=${isPython ? "8000" : isNode ? "3000" : "8080"}
      - ENV=development
      - JWT_SECRET=change_me_to_a_secure_random_key
${dbEnv ? dbEnv : ""}
    depends_on:
      db:
        condition: service_healthy

${composeDbSection}

${dbType !== "sqlite" ? `volumes:
  ${dbType}_data:` : ""}`;

  // 3. Generate README.md
  const readme = `# Project Boilerplate

Generated architecture boilerplate for your development setup.

## Technical Stack
${Object.entries(stack).map(([k, v]) => `- **${k}**: ${v}`).join("\n")}

## Modules Architecture
${modules.map(m => `- **${typeof m === "string" ? m : m.name}**: ${typeof m === "string" ? "" : m.description}`).join("\n")}

## Database Tables
${entities.map(e => {
  const name = typeof e === "string" ? e : e.name;
  const cols = typeof e === "string" ? [] : e.columns;
  return `- \`${name}\` (${cols.map(c => typeof c === "string" ? c : c.name).join(", ")})`;
}).join("\n")}

## Local Setup

### 1. Requirements
- Docker and Docker Compose installed

### 2. Startup Command
\`\`\`bash
# Build and launch the containers
docker-compose up --build -d

# Verify containers are running
docker-compose ps
\`\`\`

### 3. Ports Configuration
- Backend Web Server: \`${isPython ? "http://localhost:8000" : isNode ? "http://localhost:3000" : "http://localhost:8080"}\`
- DB Server: \`${dbType === "postgres" ? "5432" : dbType === "mysql" ? "3306" : dbType === "mongodb" ? "27017" : "none"}\`
`;

  // 4. Generate .env.example
  const envExample = `PORT=${isPython ? "8000" : isNode ? "3000" : "8080"}
ENV=development
JWT_SECRET=super_secret_token_change_me_in_production

# Database Credentials
DB_HOST=localhost
DB_PORT=${dbType === "postgres" ? "5432" : dbType === "mysql" ? "3306" : dbType === "mongodb" ? "27017" : "3000"}
DB_NAME=app_db
DB_USER=${dbType === "postgres" ? "postgres" : dbType === "mysql" ? "root" : ""}
DB_PASSWORD=password
`;

  // Map file labels to content
  const files = {
    readme: { name: "README.md", code: readme, mode: "markdown" },
    dockerfile: { name: "Dockerfile", code: dockerfile, mode: "dockerfile" },
    compose: { name: "docker-compose.yml", code: dockerCompose, mode: "yaml" },
    env: { name: ".env.example", code: envExample, mode: "properties" },
  };

  const activeContent = files[activeFile] || files.readme;

  const handleCopy = async () => {
    if (activeFile === "structure") return;
    try {
      await navigator.clipboard.writeText(activeContent.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy boilerplate: ", err);
    }
  };

  const handleDownload = () => {
    if (activeFile === "structure") return;
    const blob = new Blob([activeContent.code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = activeContent.name;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadZip = async () => {
    setIsZipping(true);
    try {
      const payload = {
        "README.md": readme,
        "Dockerfile": dockerfile,
        "docker-compose.yml": dockerCompose,
        ".env.example": envExample
      };
      
      const response = await fetch(`${API_BASE_URL}/api/generate/zip`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error("Failed to create ZIP archive");
      }
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "boilerplate.zip";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("ZIP creation failed:", err);
      alert("Failed to download ZIP file");
    } finally {
      setIsZipping(false);
    }
  };

  const getFolderStructure = () => {
    const root = {
      name: "project-root",
      isFolder: true,
      children: []
    };

    root.children.push({ name: "README.md", isFolder: false });
    root.children.push({ name: "Dockerfile", isFolder: false });
    root.children.push({ name: "docker-compose.yml", isFolder: false });
    root.children.push({ name: ".env.example", isFolder: false });

    if (isPython) {
      root.children.push({ name: "requirements.txt", isFolder: false });
      const appDir = {
        name: "app",
        isFolder: true,
        children: [
          { name: "__init__.py", isFolder: false },
          { name: "main.py", isFolder: false },
          { 
            name: "core", 
            isFolder: true, 
            children: [
              { name: "__init__.py", isFolder: false },
              { name: "config.py", isFolder: false }
            ] 
          }
        ]
      };
      
      // Add routes for modules
      const routesDir = { name: "routes", isFolder: true, children: [] };
      routesDir.children.push({ name: "__init__.py", isFolder: false });
      modules.forEach(m => {
        const name = typeof m === "string" ? m : m.name;
        const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, "_") + ".py";
        routesDir.children.push({ name: cleanName, isFolder: false });
      });
      
      const apiDir = {
        name: "api",
        isFolder: true,
        children: [
          { name: "__init__.py", isFolder: false },
          routesDir
        ]
      };
      appDir.children.push(apiDir);

      // Add models for DB tables
      const modelsDir = { name: "models", isFolder: true, children: [] };
      modelsDir.children.push({ name: "__init__.py", isFolder: false });
      entities.forEach(e => {
        const name = typeof e === "string" ? e : e.name;
        const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, "_") + ".py";
        modelsDir.children.push({ name: cleanName, isFolder: false });
      });
      appDir.children.push(modelsDir);

      // Add schemas
      const schemasDir = {
        name: "schemas",
        isFolder: true,
        children: [
          { name: "__init__.py", isFolder: false },
          { name: "common.py", isFolder: false }
        ]
      };
      appDir.children.push(schemasDir);

      root.children.push(appDir);
    } else {
      // Node / other stack
      root.children.push({ name: "package.json", isFolder: false });
      
      const srcDir = {
        name: "src",
        isFolder: true,
        children: [
          { name: "index.js", isFolder: false },
          { 
            name: "config", 
            isFolder: true, 
            children: [{ name: "db.js", isFolder: false }] 
          }
        ]
      };

      // Add routes
      const routesDir = { name: "routes", isFolder: true, children: [] };
      modules.forEach(m => {
        const name = typeof m === "string" ? m : m.name;
        const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, "_") + ".js";
        routesDir.children.push({ name: cleanName, isFolder: false });
      });
      srcDir.children.push(routesDir);

      // Add models
      const modelsDir = { name: "models", isFolder: true, children: [] };
      entities.forEach(e => {
        const name = typeof e === "string" ? e : e.name;
        const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, "_") + ".js";
        modelsDir.children.push({ name: cleanName, isFolder: false });
      });
      srcDir.children.push(modelsDir);

      root.children.push(srcDir);
    }

    return [root];
  };

  return (
    <section className="result-block wide" style={{ marginTop: "24px", border: "1px solid var(--border-hover)", background: "rgba(30, 41, 59, 0.25)" }}>
      <div className="section-heading action-heading" style={{ borderBottom: "1px solid var(--border-color)", paddingBottom: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Server size={18} style={{ color: "var(--accent-purple)" }} />
          <h3 style={{ margin: 0 }}>Developer Starter Kit</h3>
          <span className="section-count" style={{ background: "rgba(139, 92, 246, 0.15)", color: "#a78bfa", borderColor: "rgba(139, 92, 246, 0.3)" }}>Boilerplate</span>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button 
            className="icon-button" 
            type="button" 
            onClick={handleDownloadZip} 
            disabled={isZipping}
            title="Download starter kit as ZIP archive"
            style={{ 
              background: "rgba(139, 92, 246, 0.15)", 
              borderColor: "rgba(139, 92, 246, 0.3)", 
              color: "#a78bfa",
              display: "flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            {isZipping ? (
              <span className="spinner" style={{ width: "13px", height: "13px", border: "2px solid rgba(255,255,255,0.2)", borderTopColor: "#a78bfa" }} />
            ) : (
              <FolderOpen size={14} />
            )}
            <span>Download ZIP</span>
          </button>
          
          {activeFile !== "structure" && (
            <>
              <button className="icon-button" type="button" onClick={handleCopy} title="Copy file content">
                {copied ? (
                  <>
                    <Check size={15} style={{ color: "#10b981" }} />
                    <span style={{ color: "#10b981" }}>Copied</span>
                  </>
                ) : (
                  <>
                    <Clipboard size={15} />
                    <span>Copy</span>
                  </>
                )}
              </button>
              <button className="icon-button" type="button" onClick={handleDownload} title="Download file">
                <Download size={15} />
                <span>Download</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "20px", marginTop: "14px" }}>
        {/* Navigation Sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <button
            className={`diagram-tab ${activeFile === "structure" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveFile("structure")}
            style={{ width: "100%", justifyContent: "flex-start", borderRadius: "6px" }}
          >
            <Folder size={14} />
            Folder Structure
          </button>
          <div style={{ margin: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }} />
          
          <button
            className={`diagram-tab ${activeFile === "readme" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveFile("readme")}
            style={{ width: "100%", justifyContent: "flex-start", borderRadius: "6px" }}
          >
            <Code size={14} />
            README.md
          </button>
          <button
            className={`diagram-tab ${activeFile === "dockerfile" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveFile("dockerfile")}
            style={{ width: "100%", justifyContent: "flex-start", borderRadius: "6px" }}
          >
            <FileCode size={14} />
            Dockerfile
          </button>
          <button
            className={`diagram-tab ${activeFile === "compose" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveFile("compose")}
            style={{ width: "100%", justifyContent: "flex-start", borderRadius: "6px" }}
          >
            <Server size={14} />
            docker-compose.yml
          </button>
          <button
            className={`diagram-tab ${activeFile === "env" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveFile("env")}
            style={{ width: "100%", justifyContent: "flex-start", borderRadius: "6px" }}
          >
            <Terminal size={14} />
            .env.example
          </button>
        </div>

        {/* Code display / Folder Tree Display */}
        {activeFile === "structure" ? (
          <div style={{ 
            background: "#060913", 
            border: "1px solid var(--border-color)", 
            borderRadius: "8px", 
            padding: "16px 20px", 
            maxHeight: "380px", 
            overflowY: "auto" 
          }}>
            <div style={{ 
              borderBottom: "1px solid rgba(255,255,255,0.05)", 
              paddingBottom: "8px", 
              marginBottom: "12px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}>
              <span style={{ fontSize: "0.82rem", fontWeight: "600", color: "var(--text-main)" }}>Project Folder Tree</span>
              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: "4px" }}>
                {isPython ? "PYTHON/FASTAPI" : "JAVASCRIPT/NODE"}
              </span>
            </div>
            <DirectoryTree data={getFolderStructure()} />
          </div>
        ) : (
          <div style={{ background: "#060913", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "14px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "6px", marginBottom: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "var(--text-muted)" }}>{activeContent.name}</span>
              <span style={{ fontSize: "0.7rem", padding: "2px 6px", background: "rgba(255,255,255,0.05)", borderRadius: "4px", textTransform: "uppercase", color: "var(--text-secondary)" }}>{activeContent.mode}</span>
            </div>
            <pre style={{ margin: 0, padding: 0, overflowX: "auto", maxHeight: "350px" }}>
              <code style={{ fontFamily: "monospace", fontSize: "0.82rem", color: "#38bdf8", whiteSpace: "pre" }}>{activeContent.code}</code>
            </pre>
          </div>
        )}
      </div>
    </section>
  );
}
