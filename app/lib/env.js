// Startup check for the settings the server cannot run without. It prints the NAMES of what is
// missing or wrong, never the values (a connection string and a secret must not reach logs).

export const REQUIRED_ENV = ["MONGODB_URI", "JWT_SECRET"];
export const MIN_JWT_SECRET_LENGTH = 32;

// -> { missing: [names], problems: [text], ok }
export function checkEnv(env = process.env) {
  const missing = REQUIRED_ENV.filter((name) => !env[name] || !env[name].trim());
  const problems = [];
  const secret = env.JWT_SECRET;
  if (secret && secret.trim()) {
    if (secret === "change_me") problems.push('JWT_SECRET is still the example value "change_me".');
    else if (secret.length < MIN_JWT_SECRET_LENGTH) problems.push(`JWT_SECRET is shorter than ${MIN_JWT_SECRET_LENGTH} characters. Make one with: openssl rand -hex 32`);
  }
  return { missing, problems, ok: missing.length === 0 && problems.length === 0 };
}

// Prints the result of checkEnv (names only). Returns the same result.
export function reportEnv(env = process.env, log = console.error) {
  const result = checkEnv(env);
  if (result.missing.length > 0) log(`[rescuenet] Missing environment variables: ${result.missing.join(", ")}`);
  for (const problem of result.problems) log(`[rescuenet] ${problem}`);
  return result;
}
