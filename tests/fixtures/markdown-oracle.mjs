// Reference regex implementation of the inline and link-rename rules, used as the test oracle.
// It is simple but can take quadratic time, which is why the shipped scanner is not a regex.
import { safeURL } from "../../web/model.js";
const icon = (name) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${{ bulb: "M8 16c0-3-3-3-3-7a7 7 0 0 1 14 0c0 4-3 4-3 7M8 17h8M9 21h6" }[name]}"/></svg>`;
export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function inline(s) {
  const re =
    /(`[^`]+`|\[\[[^\]\n]+\]\]|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\[\]\n]+\]\([^\s)]+\))/g;
  let out = "",
    pos = 0;
  for (const m of s.matchAll(re)) {
    out += esc(s.slice(pos, m.index));
    const t = m[0];
    if (t.startsWith("`")) out += "<code>" + esc(t.slice(1, -1)) + "</code>";
    else if (t.startsWith("[[")) {
      const name = t.slice(2, -2);
      out += `<button class="wiki-link" data-wiki="${esc(name)}">${esc(name)}</button>`;
    } else if (t.startsWith("**"))
      out += "<strong>" + esc(t.slice(2, -2)) + "</strong>";
    else if (t.startsWith("*")) out += "<em>" + esc(t.slice(1, -1)) + "</em>";
    else {
      const a = t.match(/^\[([^\]]+)\]\((.+)\)$/);
      const url = safeURL(a[2]);
      out += url
        ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(a[1])}</a>`
        : esc(t);
    }
    pos = m.index + t.length;
  }
  return out + esc(s.slice(pos));
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
        `<blockquote>${tip ? `<div class="callout-title">${icon("bulb")}${inline(tip[1] || "Note")}</div>` : `<p>${inline(first)}</p>`}${quote
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
export function renameLinks(body, old, title) {
  return body.replace(/\[\[([^\]]+)\]\]/g, (whole, target) =>
    target.toLowerCase() === old.toLowerCase() ? "[[" + title + "]]" : whole,
  );
}
