import { BRAND } from "../web/brand.js";

// Structured, content-free server logging. A line may only carry the allow-listed fields below:
// never request bodies, note text, query strings or exception messages.
const ALERTS = {
  host_rejected:
    "blocked a request with an unexpected Host header (possible DNS rebinding)",
};
const ERROR_EVENTS = new Set(["server_error"]);

// Replaces everything outside printable ASCII (including C1 controls and U+2028/2029).
export const sanitizeHost = (host) =>
  String(host ?? "")
    .slice(0, 100)
    .replace(/[^\x20-\x7e]/g, "?");

export function createLogger({
  prefix = BRAND.logPrefix,
  now = () => Date.now(),
  warn = (...a) => console.warn(...a),
  error = (...a) => console.error(...a),
  setTimer = (fn, ms) => {
    const t = setTimeout(fn, ms);
    t.unref?.();
    return t;
  },
  windowMs = 60000,
  maxPerWindow = 10,
} = {}) {
  const windows = new Map();
  const alerted = new Set();
  const iso = () => new Date(now()).toISOString();

  function closeWindow(event) {
    const w = windows.get(event);
    if (!w) return;
    windows.delete(event);
    alerted.delete(event);
    // Report the true total when a burst ended, even if no further event arrives.
    if (w.suppressed > 0)
      warn(
        JSON.stringify({
          ts: iso(),
          event,
          count: w.count,
          suppressed: w.suppressed,
        }),
      );
  }

  function logEvent(event, fields = {}) {
    let w = windows.get(event);
    if (!w) {
      w = { count: 0, suppressed: 0, timer: null };
      w.timer = setTimer(() => closeWindow(event), windowMs);
      windows.set(event, w);
    }
    w.count++;
    if (w.count > maxPerWindow) {
      w.suppressed++;
      if (w.suppressed === 1)
        warn(JSON.stringify({ ts: iso(), event, suppressed: 1 }));
      return;
    }
    const line = { ts: iso(), event };
    if (Number.isInteger(fields.status)) line.status = fields.status;
    if (typeof fields.method === "string")
      line.method = fields.method.slice(0, 16).replace(/[^\x20-\x7e]/g, "?");
    if (typeof fields.error === "string")
      line.error = /^[\w.$-]{1,60}$/.test(fields.error)
        ? fields.error
        : "Error";
    if (event === "host_rejected") line.host = sanitizeHost(fields.host);
    (ERROR_EVENTS.has(event) ? error : warn)(JSON.stringify(line));
    if (ALERTS[event] && !alerted.has(event)) {
      alerted.add(event);
      warn(`${prefix} ALERT: ${ALERTS[event]}.`);
    }
  }

  return { logEvent, closeWindow };
}

export const { logEvent } = createLogger();
