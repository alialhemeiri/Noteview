import katex from "katex";
import HTMLtoDOCX from "@turbodocx/html-to-docx";
import type { PageSetup } from "../types";
import { sanitizeHtml, wrapHtmlDocument } from "./convert";
import { writeBytes } from "./tauri";

/** Render any unrendered KaTeX placeholders ([data-latex]) inside a container. */
export function renderMathIn(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>('[data-type="inline-math"],[data-type="block-math"]').forEach((el) => {
    const latex = el.getAttribute("data-latex") ?? el.textContent ?? "";
    const block = el.getAttribute("data-type") === "block-math";
    el.textContent = "";
    try {
      katex.render(latex, el, { displayMode: block, throwOnError: false, errorColor: "var(--danger)" });
    } catch {
      el.textContent = latex;
    }
  });
}

function pageCss(page: PageSetup): string {
  return `@page { size: ${page.paper} ${page.orientation}; margin: ${page.marginMm}mm; }`;
}

/**
 * Print the given document HTML via the system WebView print dialog (which also
 * offers "Save as PDF"). Reuses the app's bundled fonts + KaTeX CSS by printing
 * an in-document overlay rather than a bare iframe.
 */
export function printDocument(bodyHtml: string, page: PageSetup, dir: string): Promise<void> {
  return new Promise((resolve) => {
    const style = document.createElement("style");
    style.id = "nv-print-style";
    style.textContent = `
      ${pageCss(page)}
      @media print {
        body > *:not(#nv-print-root) { display: none !important; }
        #nv-print-root { display: block !important; }
      }
      #nv-print-root { display: none; }
    `;
    const root = document.createElement("div");
    root.id = "nv-print-root";
    root.className = "nv-export nv-prose";
    root.setAttribute("dir", dir);
    root.innerHTML = sanitizeHtml(bodyHtml);
    document.body.appendChild(style);
    document.body.appendChild(root);
    renderMathIn(root);

    const cleanup = () => {
      window.removeEventListener("afterprint", cleanup);
      root.remove();
      style.remove();
      resolve();
    };
    window.addEventListener("afterprint", cleanup);
    // Defer so layout + KaTeX settle before the print snapshot.
    setTimeout(() => window.print(), 60);
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Best-effort .docx export: HTML → docx via TurboDocx, written to `path`. */
export async function exportDocxFile(
  path: string,
  bodyHtml: string,
  title: string,
  dir: string,
): Promise<void> {
  const fullHtml = wrapHtmlDocument(sanitizeHtml(bodyHtml), title, dir);
  const result: Blob | ArrayBuffer = await HTMLtoDOCX(fullHtml, undefined, {
    table: { row: { cantSplit: true } },
    footer: false,
    pageNumber: false,
  });
  const buffer = result instanceof Blob ? await result.arrayBuffer() : result;
  await writeBytes(path, arrayBufferToBase64(buffer));
}
