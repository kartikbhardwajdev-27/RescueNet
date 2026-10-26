// A tiny Chrome DevTools Protocol driver for the browser checks (scripts/browser/): launch headless
// Chrome, open a page, evaluate JavaScript in it, collect console messages and network requests.
// No packages: it talks to Chrome's debugging port with Node's built-in fetch and WebSocket.
// Chrome's location: CHROME_PATH, else the usual place on a Mac.
import { spawn } from "node:child_process";
import fs from "node:fs";

const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export async function launch({ port = 9333, profile, extraArgs = [] }) {
  fs.mkdirSync(profile, { recursive: true });
  const proc = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--window-size=1280,900",
      ...extraArgs,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  for (let i = 0; i < 100; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) break;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  return {
    proc,
    port,
    async newPage() {
      const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
      const target = await response.json();
      return connect(target.webSocketDebuggerUrl, target.id, port);
    },
    async close() {
      proc.kill("SIGTERM");
    },
  };
}

function connect(url, id, port) {
  const ws = new WebSocket(url);
  let nextId = 1;
  const pending = new Map();
  const listeners = [];
  const logs = [];
  const requests = [];
  const opened = new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(`${message.error.message}`));
      else resolve(message.result);
      return;
    }
    if (message.method === "Runtime.consoleAPICalled") logs.push(`${message.params.type}: ${message.params.args.map((a) => a.value ?? a.description).join(" ")}`);
    if (message.method === "Runtime.exceptionThrown") logs.push(`exception: ${message.params.exceptionDetails.text} ${message.params.exceptionDetails.exception?.description ?? ""}`);
    if (message.method === "Network.requestWillBeSent") requests.push(message.params.request.url);
    for (const listener of listeners) listener(message);
  };
  const page = {
    id,
    logs,
    requests,
    async ready() {
      await opened;
      await page.send("Page.enable");
      await page.send("Runtime.enable");
      await page.send("Network.enable");
      return page;
    },
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const messageId = nextId++;
        pending.set(messageId, { resolve, reject });
        ws.send(JSON.stringify({ id: messageId, method, params }));
      });
    },
    async goto(url, { waitMs = 0 } = {}) {
      const loaded = new Promise((resolve) => {
        const listener = (message) => {
          if (message.method === "Page.loadEventFired") {
            listeners.splice(listeners.indexOf(listener), 1);
            resolve();
          }
        };
        listeners.push(listener);
      });
      await page.send("Page.navigate", { url });
      await Promise.race([loaded, new Promise((r) => setTimeout(r, 30000))]);
      if (waitMs) await new Promise((r) => setTimeout(r, waitMs));
    },
    async eval(expression) {
      const result = await page.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, timeout: 120000 });
      if (result.exceptionDetails) throw new Error(`${result.exceptionDetails.text}: ${result.exceptionDetails.exception?.description ?? ""}`);
      return result.result.value;
    },
    async waitFor(expression, timeoutMs = 20000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (await page.eval(expression).catch(() => false)) return true;
        await new Promise((r) => setTimeout(r, 200));
      }
      throw new Error(`Timed out waiting for: ${expression}`);
    },
    async screenshot(file) {
      const { data } = await page.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(file, Buffer.from(data, "base64"));
    },
    async close() {
      ws.close();
      await fetch(`http://127.0.0.1:${port}/json/close/${id}`).catch(() => {});
    },
  };
  return page;
}
