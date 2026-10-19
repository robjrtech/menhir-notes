// Host allow-list for the local server (DNS-rebinding defence).
// Returns "serve" for the canonical host, "redirect" for localhost (sent to the canonical
// origin), and null for anything else, including a missing Host.
export function localOrigin(hostHeader, port) {
  if (typeof hostHeader !== "string" || !Number.isInteger(port)) return null;
  const key = hostHeader.toLowerCase();
  if (key === `127.0.0.1:${port}`) return "serve";
  if (key === `localhost:${port}`) return "redirect";
  return null;
}

export const canonicalURL = (port) => `http://127.0.0.1:${port}/`;
