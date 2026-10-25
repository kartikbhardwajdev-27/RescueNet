// The laptop's address as a person types it into the Android app
// ("Laptop address", e.g. http://192.168.1.6:3000).
//
// Pure and dependency-free: the first-run screen, the Settings page and the
// checks in scripts/check-server-address.mjs all use it.
//
// What is accepted, and why:
//   - http or https only; "192.168.1.6:3000" is read as http://192.168.1.6:3000
//   - just a host and an optional port: no path, query, fragment or username and
//     password. The app adds "/api/..." itself, and a password typed into an
//     address would be sent in every request.
//   - plain http:// only for addresses on your own network (see isLocalHost).
//     The app allows cleartext traffic so a phone can talk to a laptop that has
//     no certificate; refusing plain http to a public address is what keeps that
//     allowance from being used against the person. Anything else needs https://.
//
// The result is the URL's origin ("http://192.168.1.6:3000", no trailing slash).

export const ADDRESS_EXAMPLE = "http://192.168.1.6:3000";

const MAX_LENGTH = 200;

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

// An address that only exists on the local network (or on the device itself).
// `hostname` is what `new URL()` reports, so odd spellings of an IPv4 address
// ("http://3232235782") have already been turned into dotted form.
export function isLocalHost(hostname) {
  const host = hostname.toLowerCase();
  const v4 = IPV4.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 10 || //                          10.0.0.0/8
      a === 127 || //                         loopback
      (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
      (a === 192 && b === 168) || //          192.168.0.0/16
      (a === 169 && b === 254) //             link-local
    );
  }
  if (host.startsWith("[")) {
    // IPv6: loopback, unique-local (fc00::/7) and link-local (fe80::/10).
    return host === "[::1]" || /^\[f[cd][0-9a-f]{2}:/.test(host) || /^\[fe[89ab][0-9a-f]:/.test(host);
  }
  return (
    host === "localhost" ||
    !host.includes(".") || //                 a bare name such as "laptop"
    host.endsWith(".local") ||
    host.endsWith(".lan") ||
    host.endsWith(".home.arpa")
  );
}

// -> { ok: true, url } or { ok: false, error } where `error` is ready to show.
export function normalizeServerAddress(input) {
  if (typeof input !== "string") return { ok: false, error: "Enter the laptop's address." };
  const text = input.trim();
  if (text === "") return { ok: false, error: `Enter the laptop's address, for example ${ADDRESS_EXAMPLE}.` };
  if (text.length > MAX_LENGTH) return { ok: false, error: "That address is too long." };
  if (/\s/.test(text)) return { ok: false, error: "An address has no spaces in it." };

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
  let url;
  try {
    url = new URL(hasScheme ? text : `http://${text}`);
  } catch {
    return { ok: false, error: `That doesn't look like an address. Try ${ADDRESS_EXAMPLE}.` };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "The address must start with http:// or https://." };
  }
  if (url.username !== "" || url.password !== "") {
    return { ok: false, error: "Leave the username and password out of the address." };
  }
  if (url.hostname === "") return { ok: false, error: `Add the laptop's address, for example ${ADDRESS_EXAMPLE}.` };
  if (url.port === "0") return { ok: false, error: "That port number isn't valid." };
  if (url.hostname === "0.0.0.0") {
    return { ok: false, error: "0.0.0.0 is not an address a phone can reach. Use the laptop's network address." };
  }
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
    return { ok: false, error: `Use only the address and port, with nothing after it, like ${ADDRESS_EXAMPLE}.` };
  }
  if (url.protocol === "http:" && !isLocalHost(url.hostname)) {
    return {
      ok: false,
      error: "Plain http:// is only allowed for addresses on your own network (like 192.168.x.x). Use https:// for anything else.",
    };
  }

  return { ok: true, url: url.origin };
}
