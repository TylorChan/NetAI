export async function requestWorkerEvaluation({ workerUrl, payload }) {
  if (!workerUrl) {
    throw new Error("WORKER_URL is required");
  }

  const response = await fetch(`${workerUrl}/tasks/evaluate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Worker evaluate failed (${response.status}): ${text}`);
  }

  return response.json();
}

export async function requestWorkerSummary({ workerUrl, payload }) {
  if (!workerUrl) {
    throw new Error("WORKER_URL is required");
  }

  const response = await fetch(`${workerUrl}/tasks/summarize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Worker summarize failed (${response.status}): ${text}`);
  }

  return response.json();
}

export async function requestWorkerNudges({ workerUrl, payload }) {
  if (!workerUrl) {
    throw new Error("WORKER_URL is required");
  }

  const response = await fetch(`${workerUrl}/tasks/nudges`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Worker nudges failed (${response.status}): ${text}`);
  }

  return response.json();
}

export async function requestWorkerSessionMetadata({ workerUrl, payload }) {
  if (!workerUrl) {
    throw new Error("WORKER_URL is required");
  }

  const response = await fetch(`${workerUrl}/tasks/session_metadata`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Worker session_metadata failed (${response.status}): ${text}`);
  }

  return response.json();
}
