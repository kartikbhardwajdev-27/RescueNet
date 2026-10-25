// Checks for the pure rules behind the Android app's connection to the laptop:
//
//   npm run check:mobile
//
//   lib/serverAddress.js  what may be typed as "Laptop address", and what it becomes
//   lib/bearer.js         reading the login token out of an Authorization header
//
// The expected values are written by hand from the rules in those files' header
// comments, not copied from their output.
import { bearerTokenFrom } from "../lib/bearer.js";
import { isLocalHost, normalizeServerAddress } from "../lib/serverAddress.js";

const failures = [];
let count = 0;
const check = (name, actual, expected) => {
  count += 1;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
  }
};
const url = (input) => {
  const result = normalizeServerAddress(input);
  return result.ok ? result.url : `ERROR`;
};

// ---- addresses that are accepted, and what they are normalised to ----
check("full address", url("http://192.168.1.6:3000"), "http://192.168.1.6:3000");
check("no scheme means http", url("192.168.1.6:3000"), "http://192.168.1.6:3000");
check("surrounding spaces", url("  http://192.168.1.6:3000  "), "http://192.168.1.6:3000");
check("trailing slash dropped", url("http://192.168.1.6:3000/"), "http://192.168.1.6:3000");
check("upper case host", url("HTTP://Laptop.LOCAL:3000"), "http://laptop.local:3000");
check("default http port dropped", url("http://10.0.0.5:80"), "http://10.0.0.5");
check("10.x network", url("10.1.2.3:3000"), "http://10.1.2.3:3000");
check("172.16 network", url("172.16.0.9:3000"), "http://172.16.0.9:3000");
check("172.31 network", url("172.31.255.1:3000"), "http://172.31.255.1:3000");
check("android emulator host", url("http://10.0.2.2:3000"), "http://10.0.2.2:3000");
check("localhost", url("http://localhost:3000"), "http://localhost:3000");
check("bare name", url("http://mylaptop:3000"), "http://mylaptop:3000");
check("hotspot style .lan name", url("http://macbook.lan:3000"), "http://macbook.lan:3000");
check("ipv6 loopback", url("http://[::1]:3000"), "http://[::1]:3000");
check("https to a public host", url("https://rescuenet.example.org"), "https://rescuenet.example.org");
check("https to a public host with port", url("https://rescuenet.example.org:8443/"), "https://rescuenet.example.org:8443");
check("an unusual spelling of an IPv4 address is read as dotted", url("http://3232235782:3000"), "http://192.168.1.6:3000");

// ---- addresses that are refused ----
const refused = {
  "nothing": "",
  "only spaces": "   ",
  "not a string is handled elsewhere, text with spaces": "192.168.1.6 :3000",
  "ftp scheme": "ftp://192.168.1.6",
  "file scheme": "file:///etc/passwd",
  "javascript scheme": "javascript://x",
  "a path": "http://192.168.1.6:3000/api",
  "a query": "http://192.168.1.6:3000/?a=1",
  "a fragment": "http://192.168.1.6:3000/#x",
  "username and password": "http://user:pass@192.168.1.6:3000",
  "username only": "http://user@192.168.1.6:3000",
  "port 0": "http://192.168.1.6:0",
  "port too big": "http://192.168.1.6:99999",
  "0.0.0.0": "http://0.0.0.0:3000",
  "plain http to a public IPv4 address": "http://8.8.8.8:3000",
  "plain http to a public name": "http://example.com",
  "172.32 is not private": "http://172.32.0.1:3000",
  "172.15 is not private": "http://172.15.0.1:3000",
  "192.169 is not private": "http://192.169.1.1:3000",
  "a name that only ends like a private one": "http://evil-local.example.com",
  "a very long address": `http://${"a".repeat(300)}.local`,
};
for (const [name, input] of Object.entries(refused)) check(`refused: ${name}`, url(input), "ERROR");
check("a non-string is refused", normalizeServerAddress(undefined).ok, false);
check("an error message is given", typeof normalizeServerAddress("http://8.8.8.8").error, "string");

check("isLocalHost 192.168.0.1", isLocalHost("192.168.0.1"), true);
check("isLocalHost 169.254.1.1", isLocalHost("169.254.1.1"), true);
check("isLocalHost 127.0.0.1", isLocalHost("127.0.0.1"), true);
check("isLocalHost fe80 link-local", isLocalHost("[fe80::1]"), true);
check("isLocalHost fd00 unique-local", isLocalHost("[fd12:3456::1]"), true);
check("isLocalHost public ipv6", isLocalHost("[2001:db8::1]"), false);
check("isLocalHost 1.1.1.1", isLocalHost("1.1.1.1"), false);

// ---- Authorization header ----
const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJpZCI6IjEifQ.c2lnbmF0dXJl";
check("bearer token is read", bearerTokenFrom(`Bearer ${jwt}`), jwt);
check("scheme is case-insensitive", bearerTokenFrom(`bearer ${jwt}`), jwt);
check("BEARER upper case", bearerTokenFrom(`BEARER ${jwt}`), jwt);
check("surrounding spaces", bearerTokenFrom(`  Bearer ${jwt}  `), undefined); // a header never starts with spaces: not ours
check("trailing space is trimmed", bearerTokenFrom(`Bearer ${jwt} `), jwt);
check("no header", bearerTokenFrom(null), undefined);
check("empty header", bearerTokenFrom(""), undefined);
check("Basic auth is not ours", bearerTokenFrom("Basic dXNlcjpwYXNz"), undefined);
check("scheme without a token", bearerTokenFrom("Bearer"), undefined);
check("scheme with a blank token", bearerTokenFrom("Bearer "), null);
check("not shaped like a JWT", bearerTokenFrom("Bearer abc"), null);
check("two parts only", bearerTokenFrom("Bearer abc.def"), null);
check("four parts", bearerTokenFrom("Bearer a.b.c.d"), null);
check("illegal characters", bearerTokenFrom("Bearer a.b.c!"), null);
check("a second token after a space", bearerTokenFrom(`Bearer ${jwt} extra`), null);
check("an oversized token", bearerTokenFrom(`Bearer ${"a".repeat(3000)}.b.c`), null);

if (failures.length > 0) {
  console.error(`${failures.length} of ${count} checks FAILED:\n`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`All ${count} checks passed.`);
