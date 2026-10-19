import { safeURL } from "./model.js";

const BULB_ICON =
  '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 16c0-3-3-3-3-7a7 7 0 0 1 14 0c0 4-3 4-3 7M8 17h8M9 21h6"/></svg>';

export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

// Linear-time helpers. Every lookup is cached so that a run of "[" characters reuses one
// scan instead of rescanning to the end of the line.
// find(from) returns the first index >= from whose char code satisfies test, or -1. Queries
// arrive in (nearly) non-decreasing order, so a cached hit stays valid while from lies in
// [from0, hit], and a cached miss stays valid for every later from.
function finder(s, test) {
  let from0 = 0,
    hit = -2;
  return (from) => {
    if (hit !== -2 && from >= from0 && (hit === -1 || from <= hit)) return hit;
    let i = from;
    while (i < s.length && !test(s.charCodeAt(i))) i++;
    from0 = from;
    hit = i < s.length ? i : -1;
    return hit;
  };
}

// Same set as the regex class \s (no u flag, so UTF-16 code units).
function isSpace(c) {
  return (
    (c >= 9 && c <= 13) ||
    c === 32 ||
    c === 0xa0 ||
    c === 0x1680 ||
    (c >= 0x2000 && c <= 0x200a) ||
    c === 0x2028 ||
    c === 0x2029 ||
    c === 0x202f ||
    c === 0x205f ||
    c === 0x3000 ||
    c === 0xfeff
  );
}

// One left-to-right pass over the inline constructs, equivalent to the regex
//   /(`[^`]+`|\[\[[^\]\n]+\]\]|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\[\]\n]+\]\([^\s)]+\))/g
// At each position the alternatives are tried in that order and the leftmost match wins.
// A link's text cannot contain "[" (as in CommonMark), so "[[a](u)" renders a literal "["
// followed by the link "a".
export function inline(s) {
  const n = s.length;
  const nextTick = finder(s, (c) => c === 96);
  const nextStar = finder(s, (c) => c === 42);
  const nextClose = finder(s, (c) => c === 93 || c === 10); // "]" or newline
  const nextOpen = finder(s, (c) => c === 91); // "["
  // End of the run of [^\s)] characters starting at m; cached for starts inside that run.
  let urlFrom = 0,
    urlStop = -1;
  const urlEnd = (m) => {
    if (urlStop >= 0 && m >= urlFrom && m <= urlStop) return urlStop;
    let p = m;
    while (p < n) {
      const c = s.charCodeAt(p);
      if (c === 41 || isSpace(c)) break;
      p++;
    }
    urlFrom = m;
    urlStop = p;
    return p;
  };
  let out = "",
    pos = 0,
    i = 0;
  while (i < n) {
    const c = s.charCodeAt(i);
    let end = -1,
      kind = "",
      k = -1;
    if (c === 96) {
      const j = nextTick(i + 1);
      if (j > i + 1) {
        end = j + 1;
        kind = "code";
      }
    } else if (c === 91) {
      if (s.charCodeAt(i + 1) === 91) {
        k = nextClose(i + 2);
        if (k > i + 2 && s.charCodeAt(k) === 93 && s.charCodeAt(k + 1) === 93) {
          end = k + 2;
          kind = "wiki";
        }
      }
      if (end < 0) {
        k = nextClose(i + 1);
        if (k > i + 1 && s.charCodeAt(k) === 93 && s.charCodeAt(k + 1) === 40) {
          const open = nextOpen(i + 1);
          if (open === -1 || open > k) {
            const p = urlEnd(k + 2);
            if (p > k + 2 && s.charCodeAt(p) === 41) {
              end = p + 1;
              kind = "link";
            }
          }
        }
      }
    } else if (c === 42) {
      if (s.charCodeAt(i + 1) !== 42) {
        const j = nextStar(i + 1);
        if (j > i + 1) {
          end = j + 1;
          kind = "em";
        }
      } else {
        k = nextStar(i + 2);
        if (k > i + 2 && s.charCodeAt(k + 1) === 42) {
          end = k + 2;
          kind = "strong";
        }
      }
    }
    if (end < 0) {
      i++;
      continue;
    }
    out += esc(s.slice(pos, i));
    if (kind === "code")
      out += "<code>" + esc(s.slice(i + 1, end - 1)) + "</code>";
    else if (kind === "wiki") {
      const name = s.slice(i + 2, end - 2);
      out += `<button class="wiki-link" data-wiki="${esc(name)}">${esc(name)}</button>`;
    } else if (kind === "strong")
      out += "<strong>" + esc(s.slice(i + 2, end - 2)) + "</strong>";
    else if (kind === "em")
      out += "<em>" + esc(s.slice(i + 1, end - 1)) + "</em>";
    else {
      const url = safeURL(s.slice(k + 2, end - 1));
      out += url
        ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(s.slice(i + 1, k))}</a>`
        : esc(s.slice(i, end));
    }
    pos = i = end;
  }
  return out + esc(s.slice(pos));
}

// Replaces [[old]] links (case-insensitive) with [[title]]. Same matches as
// /\[\[([^\]]+)\]\]/g, which also crosses line breaks, but linear: the next "]" is cached.
export function renameLinks(body, oldTitle, newTitle) {
  const old = oldTitle.toLowerCase();
  const n = body.length;
  const nextBracket = finder(body, (c) => c === 93);
  let out = "",
    pos = 0,
    i = 0;
  while (i < n - 1) {
    if (body.charCodeAt(i) === 91 && body.charCodeAt(i + 1) === 91) {
      const k = nextBracket(i + 2);
      if (k > i + 2 && body.charCodeAt(k + 1) === 93) {
        if (body.slice(i + 2, k).toLowerCase() === old) {
          out += body.slice(pos, i) + "[[" + newTitle + "]]";
          pos = k + 2;
        }
        i = k + 2;
        continue;
      }
    }
    i++;
  }
  return pos === 0 ? body : out + body.slice(pos);
}

export function markdown(src) {
  let out = [],
    list = false,
    quote = [],
    code = null;
  const endList = () => {
    if (list) {
      out.push("</ul>");
      list = false;
    }
  };
  const endQuote = () => {
    if (quote.length) {
      let first = quote[0],
        tip = first.match(/^\[!\w+\]\s*(.*)/);
      out.push(
        `<blockquote>${tip ? `<div class="callout-title">${BULB_ICON}${inline(tip[1] || "Note")}</div>` : `<p>${inline(first)}</p>`}${quote
          .slice(1)
          .map((x) => `<p>${inline(x)}</p>`)
          .join("")}</blockquote>`,
      );
      quote = [];
    }
  };
  src.split("\n").forEach((line, i) => {
    if (line.startsWith("```")) {
      endList();
      endQuote();
      if (code !== null) {
        out.push("<pre><code>" + esc(code.join("\n")) + "</code></pre>");
        code = null;
      } else code = [];
      return;
    }
    if (code !== null) {
      code.push(line);
      return;
    }
    if (line.startsWith(">")) {
      endList();
      quote.push(line.replace(/^>\s?/, ""));
      return;
    }
    endQuote();
    if (/^[-*] \[[ x]\] /.test(line)) {
      endList();
      const done = line[3] === "x";
      out.push(
        `<label class="task-line ${done ? "done" : ""}"><input type="checkbox" data-task="${i}" ${done ? "checked" : ""}><span>${inline(line.slice(6))}</span></label>`,
      );
      return;
    }
    if (/^[-*] |^\d+\. /.test(line)) {
      if (!list) {
        out.push("<ul>");
        list = true;
      }
      out.push("<li>" + inline(line.replace(/^[-*] |^\d+\. /, "")) + "</li>");
      return;
    }
    endList();
    let h = line.match(/^(#{1,3}) (.+)/);
    if (h) {
      out.push(
        `<h${h[1].length} id="heading-${i}">${inline(h[2])}</h${h[1].length}>`,
      );
    } else if (/^---+$/.test(line)) out.push("<hr>");
    else if (line.trim()) out.push("<p>" + inline(line) + "</p>");
  });
  endList();
  endQuote();
  if (code !== null)
    out.push("<pre><code>" + esc(code.join("\n")) + "</code></pre>");
  return out.join("");
}
