const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export { API_BASE_URL };

async function request(path, options = {}) {
  const { signal, ...restOptions } = options;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...restOptions.headers,
    },
    signal,
    ...restOptions,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed with ${response.status}`);
  }

  return response.json();
}

export function getHealth() {
  return request("/api/health");
}

export function createProject(payload) {
  return request("/api/projects", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function analyzeRequirements(requirements) {
  return request("/api/generate/analyze", {
    method: "POST",
    body: JSON.stringify({ requirements }),
  });
}

export function generateArchitecture(payload, { signal } = {}) {
  return request("/api/generate/architecture", {
    method: "POST",
    body: JSON.stringify(payload),
    signal,
  });
}
