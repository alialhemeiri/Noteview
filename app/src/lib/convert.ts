// Conversions between the three native content representations:
//   plain text  <->  Markdown source  <->  rich HTML
// Markdown is the source of truth in Markdown mode; HTML in rich mode.

import { marked } from "marked";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import DOMPurify from "dompurify";

marked.setOptions({ gfm: true, breaks: false });

const turndown = new TurndownService({
  headingStyle: "atx",
  hr: "---",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
});
turndown.use(gfm);
// Emit standard GFM strikethrough (`~~text~~`) instead of the plugin's
// single-tilde output, so saved Markdown is portable (GitHub etc.) and renders
// consistently in the remark-gfm preview. addRule prepends, so this wins.
turndown.addRule("strikethrough", {
  filter: (node) => node.nodeName === "DEL" || node.nodeName === "S" || node.nodeName === "STRIKE",
  replacement: (content) => `~~${content}~~`,
});
// Preserve hard line breaks and keep KaTeX source spans intact.
turndown.addRule("keepMath", {
  filter: (node) =>
    node.nodeName === "SPAN" &&
    (node.getAttribute("data-type") === "inline-math" ||
      node.getAttribute("data-type") === "block-math"),
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const latex = el.getAttribute("data-latex") ?? "";
    return el.getAttribute("data-type") === "block-math" ? `\n$$${latex}$$\n` : `$${latex}$`;
  },
});

/** Sanitize untrusted HTML (e.g. an opened .html file) for safe rendering. */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["dir", "style", "target", "data-latex", "data-type", "colspan", "rowspan"],
    ADD_TAGS: ["mark"],
  });
}

/** Markdown → rich HTML (for opening .md in rich mode / mode switching). */
export function mdToHtml(md: string): string {
  return sanitizeHtml(marked.parse(md) as string);
}

/** Rich HTML → Markdown (for saving rich content as .md / mode switching). */
export function htmlToMd(html: string): string {
  return turndown.turndown(html);
}

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** Plain text → HTML (one paragraph per line). */
export function textToHtml(text: string): string {
  if (!text.trim()) return "<p></p>";
  return text
    .split(/\r?\n/)
    .map((line) => (line.length ? `<p>${escapeHtml(line)}</p>` : "<p></p>"))
    .join("");
}

/** HTML → plain text, preserving block-level line breaks. Uses DOMParser so
 *  the markup is parsed into an inert document (no scripts run). */
export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const blocks = /^(P|DIV|LI|H[1-6]|TR|BLOCKQUOTE|PRE|BR)$/;
  let out = "";
  const walk = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.textContent ?? "";
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        if (el.tagName === "BR") {
          out += "\n";
          return;
        }
        walk(el);
        if (blocks.test(el.tagName)) out += "\n";
      }
    });
  };
  walk(doc.body);
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/** Wrap rich HTML body content into a complete, self-contained .html document. */
export function wrapHtmlDocument(bodyHtml: string, title: string, dir: string): string {
  return `<!doctype html>
<html dir="${dir}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

/** Pull the <body> inner HTML out of a full .html document (for opening). */
export function unwrapHtmlDocument(html: string): string {
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return match ? match[1].trim() : html;
}
