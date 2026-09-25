const API_BASE = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE) || "";

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(body?.error?.message || `HTTP ${res.status}`);
    err.code = body?.error?.code || "HTTP_ERROR";
    err.retryable = Boolean(body?.error?.retryable);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export function listSpecs() {
  return request("/api/v2/specs");
}

export function importSpec(title, text) {
  return request("/api/v2/specs/import", {
    method: "POST",
    body: JSON.stringify({ title, text }),
  });
}

export function createMission(payload) {
  return request("/api/v2/missions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getMission(id) {
  return request(`/api/v2/missions/${id}`);
}

export function confirmRules(id, payload) {
  return request(`/api/v2/missions/${id}/confirm-rules`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function startMission(id) {
  return request(`/api/v2/missions/${id}/start`, { method: "POST" });
}

export function answerMission(id, payload) {
  return request(`/api/v2/missions/${id}/answers`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function controlMission(id, payload) {
  return request(`/api/v2/missions/${id}/control`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateSpec(id, payload) {
  return request(`/api/v2/missions/${id}/spec`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function reanalyze(id) {
  return request(`/api/v2/missions/${id}/reanalyze`, { method: "POST" });
}

export function getBrief(id) {
  return request(`/api/v2/missions/${id}/brief`);
}

export function subscribeEvents(missionId, afterSequence, handlers) {
  const url = `${API_BASE}/api/v2/missions/${missionId}/events?after=${afterSequence}`;
  const es = new EventSource(url);
  let backoff = 800;

  es.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      handlers.onEvent?.(data);
    } catch {
      /* ignore */
    }
  };

  es.addEventListener("snapshot.required", () => {
    handlers.onSnapshotRequired?.();
  });

  es.onerror = () => {
    handlers.onDisconnect?.();
    es.close();
    const delay = Math.min(backoff, 8000);
    backoff = Math.min(backoff * 1.7, 8000);
    handlers._retryTimer = setTimeout(() => {
      handlers.onReconnect?.();
      const next = subscribeEvents(missionId, afterSequence, handlers);
      handlers._replace?.(next);
    }, delay);
  };

  return {
    close() {
      clearTimeout(handlers._retryTimer);
      es.close();
    },
  };
}

export function newIdempotencyKey(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
