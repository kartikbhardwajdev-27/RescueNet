// Runs once when the server starts (Next.js "instrumentation"): prints which required
// environment variables are missing, by name only.
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // During `next build` there may be no secrets yet; a deployment's build is not the place to fail.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  return import("./lib/env.js").then(({ reportEnv }) => {
    reportEnv();
  });
}
