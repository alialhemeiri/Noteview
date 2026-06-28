// Bidirectional-text helpers. Used to auto-detect document direction and to
// resolve "auto" into a concrete "ltr"/"rtl" for layout decisions.

import type { Direction } from "../types";

// Strong RTL scripts: Arabic, Hebrew, Syriac, Thaana, plus Arabic Supplement,
// Arabic Extended-A, and the Arabic Presentation Forms blocks.
const RTL_RANGE =
  /[֐-׿؀-ۿ܀-ݏݐ-ݿހ-޿ࢠ-ࣿיִ-﷿ﹰ-﻿]/;

// Any strong LTR letter (a rough Latin/Greek/Cyrillic check is enough here).
const LTR_RANGE = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/;

/** True when the string contains at least one strong RTL character. */
export function hasRTL(text: string): boolean {
  return RTL_RANGE.test(text);
}

/**
 * Detect the dominant direction of a piece of text using a first-strong scan.
 * HTML tags are stripped first so markup (e.g. the "p" in "<p>") never wins
 * over the actual content. Returns "ltr" or "rtl" (never "auto").
 */
export function detectDirection(text: string): Exclude<Direction, "auto"> {
  if (!text) return "ltr";
  const stripped = text.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ");
  // First-strong character wins (matches the Unicode bidi "paragraph" rule).
  for (const ch of stripped) {
    if (RTL_RANGE.test(ch)) return "rtl";
    if (LTR_RANGE.test(ch)) return "ltr";
  }
  return "ltr";
}

/** Resolve a possibly-"auto" direction against the document's text. */
export function resolveDirection(dir: Direction, text: string): Exclude<Direction, "auto"> {
  return dir === "auto" ? detectDirection(text) : dir;
}
