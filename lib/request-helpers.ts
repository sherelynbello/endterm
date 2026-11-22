export async function readJsonBody<T>(
  request: Request
): Promise<{ rawBody: string; data: T } | { error: string }> {
  let rawBody = "";
  try {
    rawBody = await request.text();
  } catch {
    return { error: "Unable to read request body." };
  }

  if (!rawBody) {
    return { error: "Request body is required." };
  }

  try {
    const data = JSON.parse(rawBody) as T;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { error: "Request body must be a JSON object." };
    }
    return { rawBody, data };
  } catch {
    return { error: "Invalid JSON payload." };
  }
}
