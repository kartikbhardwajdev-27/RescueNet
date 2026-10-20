// Small helpers shared by API route handlers.

export function errorResponse(status, error, extra = {}) {
  return Response.json({ error, ...extra }, { status });
}

// Returns the parsed JSON object, or null if the body isn't valid JSON or isn't an object.
export async function readJsonBody(request) {
  try {
    const body = await request.json();
    return body !== null && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}
