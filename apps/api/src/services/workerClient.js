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
