import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The Android project (Capacitor) holds generated JavaScript copied from
    // node_modules and from the static export; none of it is our source.
    "android/**",
    "dist/**",
  ]),
]);

export default eslintConfig;
