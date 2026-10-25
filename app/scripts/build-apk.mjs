// npm run apk
//
// Builds a DEBUG APK of the Android app and copies it to app/dist/RescueNet.apk.
//
//   1. npm run build:mobile       the static export of the UI (app/out), with the map
//   2. npx cap sync android       copies app/out and the plugin list into the Android project
//   3. gradlew assembleDebug      compiles it with the JDK and Android SDK in ~/dev
//   4. copy the result to app/dist/RescueNet.apk
//
// A debug APK is signed with the standard Android debug key, which Gradle makes
// in ~/.android (outside the repo). It installs on any phone that allows
// "unknown sources" (docs/APK_SETUP.md) but is not meant for the Play Store, and
// nothing here makes, reads or stores a release keystore. The APK, the SDK and
// any keystore must never be committed (app/dist is git-ignored).
//
// Where the tools are: JAVA_HOME and ANDROID_HOME if set, otherwise the folders
// docs/APK_SETUP.md tells you to make: ~/dev/jdk/<version>/Contents/Home and
// ~/dev/android-sdk. Gradle keeps its downloads in ~/dev/gradle-home when that
// folder exists (GRADLE_USER_HOME overrides).

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = path.join(appRoot, "android");
const builtApk = path.join(androidDir, "app", "build", "outputs", "apk", "debug", "app-debug.apk");
const finalApk = path.join(appRoot, "dist", "RescueNet.apk");
const dev = path.join(os.homedir(), "dev");

const fail = (message) => {
  console.error(`\napk failed: ${message}\n`);
  process.exit(1);
};

function findJdk() {
  if (process.env.JAVA_HOME && fs.existsSync(path.join(process.env.JAVA_HOME, "bin", "java"))) return process.env.JAVA_HOME;
  const root = path.join(dev, "jdk");
  if (fs.existsSync(root)) {
    for (const name of fs.readdirSync(root).sort().reverse()) {
      for (const home of [path.join(root, name, "Contents", "Home"), path.join(root, name)]) {
        if (fs.existsSync(path.join(home, "bin", "java"))) return home;
      }
    }
  }
  return null;
}

const javaHome = findJdk();
const sdk = process.env.ANDROID_HOME || (fs.existsSync(path.join(dev, "android-sdk")) ? path.join(dev, "android-sdk") : null);
if (!javaHome) fail("no JDK found. Set JAVA_HOME or put JDK 21 in ~/dev/jdk (docs/APK_SETUP.md, 'Build tools').");
if (!sdk || !fs.existsSync(path.join(sdk, "platforms"))) fail("no Android SDK found. Set ANDROID_HOME or install it in ~/dev/android-sdk (docs/APK_SETUP.md, 'Build tools').");

const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  ANDROID_HOME: sdk,
  ANDROID_SDK_ROOT: sdk,
  PATH: `${path.join(javaHome, "bin")}${path.delimiter}${process.env.PATH}`,
};
if (!env.GRADLE_USER_HOME && fs.existsSync(path.join(dev, "gradle-home"))) env.GRADLE_USER_HOME = path.join(dev, "gradle-home");

function run(title, command, args, cwd) {
  console.log(`\n== ${title}`);
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.status !== 0) fail(`"${title}" exited with ${result.status}.`);
}

const javaVersion = spawnSync(path.join(javaHome, "bin", "java"), ["-version"], { encoding: "utf8" });
console.log(`JDK: ${javaHome}\nSDK: ${sdk}\n${(javaVersion.stderr || "").split("\n")[0]}`);

run("1/3 Static export of the UI (npm run build:mobile)", process.execPath, [path.join(appRoot, "scripts", "build-mobile.mjs")], appRoot);
run("2/3 Copy it into the Android project (cap sync)", process.execPath, [path.join(appRoot, "node_modules", "@capacitor", "cli", "bin", "capacitor"), "sync", "android"], appRoot);
// Remove the previous APK first so a failed build can never leave a stale one behind.
fs.rmSync(builtApk, { force: true });
fs.rmSync(finalApk, { force: true });
run("3/3 Compile the debug APK (gradle assembleDebug)", path.join(androidDir, "gradlew"), ["assembleDebug", "--no-daemon", "-q"], androidDir);

if (!fs.existsSync(builtApk)) fail("Gradle finished but no APK was produced.");
fs.mkdirSync(path.dirname(finalApk), { recursive: true });
fs.copyFileSync(builtApk, finalApk);

const bytes = fs.statSync(finalApk).size;
const sha256 = crypto.createHash("sha256").update(fs.readFileSync(finalApk)).digest("hex");
console.log(`\nAPK ready: ${path.relative(process.cwd(), finalApk) || finalApk}`);
console.log(`  size    ${(bytes / 1024 / 1024).toFixed(1)} MB`);
console.log(`  sha256  ${sha256}`);
console.log("Install it on a phone: docs/APK_SETUP.md");
