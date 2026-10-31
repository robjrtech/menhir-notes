import http from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { localOrigin, canonicalURL } from "./local-host.mjs";
import { logEvent as defaultLog } from "./log.mjs";

// The server only hands out these ten fixed files. It never builds a file path from the
// request and never reads a request body, so no data passes through it.
const TYPES = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
};
const entry = (file, type) => ({
  url: new URL("../web/" + file, import.meta.url),
  type: TYPES[type],
});
export const FILES = Object.freeze({
  "/": entry("index.html", "html"),
  "/index.html": entry("index.html", "html"),
  "/app.js": entry("app.js", "js"),
  "/store.js": entry("store.js", "js"),
  "/drafts.js": entry("drafts.js", "js"),
  "/filesync.js": entry("filesync.js", "js"),
  "/brand.js": entry("brand.js", "js"),
  "/model.js": entry("model.js", "js"),
  "/markdown.js": entry("markdown.js", "js"),
  "/home.js": entry("home.js", "js"),
  "/styles.css": entry("styles.css", "css"),
});

export const DEFAULT_PORT = 4419;

export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

export const SECURITY_HEADERS = Object.freeze({
  "Content-Security-Policy": CSP,
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Cache-Control": "no-cache",
});

function send(res, status, headers, body) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}
const text = (res, status, message, extra = {}) =>
  send(
    res,
    status,
    { "Content-Type": "text/plain; charset=utf-8", ...extra },
    message,
  );

export function createServer({ files = FILES, logEvent = defaultLog } = {}) {
  // requireHostHeader is off so that a request with no Host reaches the handler and gets the
  // same 403 and hardening headers as every other rejected host.
  const server = http.createServer({ requireHostHeader: false }, async (req, res) => {
    try {
      const port = server.address()?.port;
      const decision = localOrigin(req.headers.host, port);
      if (!decision) {
        logEvent("host_rejected", {
          status: 403,
          method: req.method,
          host: req.headers.host,
        });
        return text(res, 403, "Forbidden host", { Connection: "close" });
      }
      if (!req.url?.startsWith("/"))
        return text(res, 400, "Bad request", { Connection: "close" });
      const hasBody =
        req.headers["transfer-encoding"] !== undefined ||
        (req.headers["content-length"] ?? "0") !== "0";
      if (decision === "redirect")
        return hasBody
          ? refuse(res, req, 308, "", { Location: canonicalURL(port) })
          : send(res, 308, { Location: canonicalURL(port) }, "");
      const isRead = req.method === "GET" || req.method === "HEAD";
      if (!isRead) {
        logEvent("method_rejected", { status: 405, method: req.method });
        return refuse(res, req, 405, "Method not allowed", {
          Allow: "GET, HEAD",
        });
      }
      const path = req.url.split(/[?#]/)[0];
      const file = Object.hasOwn(files, path) ? files[path] : null;
      if (!file)
        return hasBody
          ? refuse(res, req, 404, "Not found")
          : text(res, 404, "Not found");
      const body = await readFile(file.url);
      const headers = {
        "Content-Type": file.type,
        "Content-Length": body.length,
      };
      if (hasBody) return refuse(res, req, 200, req.method === "HEAD" ? "" : body, headers);
      send(res, 200, headers, req.method === "HEAD" ? "" : body);
    } catch (e) {
      logEvent("server_error", { status: 500, method: req?.method, error: e?.name });
      if (!res.headersSent) text(res, 500, "Server error", { Connection: "close" });
      else res.destroy();
    }
  });
  // Malformed requests still get the hardening headers.
  server.on("clientError", (_err, socket) => {
    if (!socket.writable) return socket.destroy();
    const headers = Object.entries({
      ...SECURITY_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Length": 11,
      Connection: "close",
    })
      .map(([k, v]) => `${k}: ${v}`)
      .join("\r\n");
    socket.end(`HTTP/1.1 400 Bad Request\r\n${headers}\r\n\r\nBad request`);
  });
  return server;
}

// Answers without reading the request body, then drops the connection, so an unread body
// can never be buffered in memory. The socket is closed after a short grace period rather
// than at once: resetting a connection that still has unread data can make the peer discard
// the response it has already received.
const CLOSE_GRACE_MS = 250;
function refuse(res, req, status, body, headers = {}) {
  const socket = req.socket;
  req._dump = () => {}; // stop Node from reading and discarding the rest of the body
  socket.destroySoon = () => socket.end();
  // Armed from the response itself, so the socket is closed even if Node stops calling
  // destroySoon.
  res.once("finish", () => {
    setTimeout(() => socket.destroy(), CLOSE_GRACE_MS).unref();
  });
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    "Content-Type": "text/plain; charset=utf-8",
    ...headers,
    Connection: "close",
  });
  res.end(body);
}

export function parsePort(value) {
  if (value === undefined || value === "") return DEFAULT_PORT;
  if (!/^\d{1,5}$/.test(value)) return null;
  const n = Number(value);
  return n >= 1 && n <= 65535 ? n : null;
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = parsePort(process.env.PORT);
  if (port === null) {
    console.error("PORT must be a whole number from 1 to 65535.");
    process.exit(1);
  }
  const server = createServer();
  server.on("error", (e) => {
    if (e.code === "EADDRINUSE")
      console.error(
        `Port ${port} is already in use. Stop the other program or set PORT to a different number. Your notes belong to the address you open, so a different port shows a different, empty notes space.`,
      );
    else console.error("Could not start the server (" + (e.code ?? e.name) + ").");
    process.exit(1);
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`Menhir Notes: ${canonicalURL(port)}`);
    if (process.env.PORT)
      console.warn(
        `Warning: PORT is set. Notes are stored per address, so ${canonicalURL(port)} has its own separate notes space.`,
      );
  });
}
