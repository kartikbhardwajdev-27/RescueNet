// Small helpers shared by API route handlers.

export function errorResponse(status, error, extra = {}) {
  return Response.json({ error, ...extra }, { status });
}

// No request body RescueNet accepts is anywhere near this big (the largest is a
// registration or an event: a few kilobytes). Anything bigger is refused before
// it is read into memory.
export const MAX_BODY_BYTES = 32 * 1024;

// Requests whose body was refused for size, so badBody() can say so.
const tooLarge = new WeakSet();

// Reads the body as text, giving up as soon as it passes `maxBytes`. The
// Content-Length header is checked first, but it can be missing (chunked
// uploads) or wrong, so the bytes are counted as they arrive too.
async function readTextCapped(request, maxBytes) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

// Returns the parsed JSON object, or null if the body isn't valid JSON, isn't an
// object, or is bigger than MAX_BODY_BYTES. Answer a null with badBody(request).
export async function readJsonBody(request, maxBytes = MAX_BODY_BYTES) {
  try {
    const text = await readTextCapped(request, maxBytes);
    if (text === null) {
      tooLarge.add(request);
      return null;
    }
    const body = JSON.parse(text);
    return body !== null && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

// The response for a null from readJsonBody: 413 for a body that was too big,
// 400 for anything else that was not a JSON object.
export function badBody(request) {
  return tooLarge.has(request)
    ? errorResponse(413, "Request body is too large")
    : errorResponse(400, "Request body must be a JSON object");
}
