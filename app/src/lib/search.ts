import type { FindState } from "../state/editorBridge";

export interface FindMatch {
  start: number;
  end: number;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Build a global RegExp from a FindState, or null if the query is empty/invalid. */
export function buildRegex(state: FindState): RegExp | null {
  if (!state.query) return null;
  let source = state.regex ? state.query : escapeRegExp(state.query);
  if (state.wholeWord) source = `\\b(?:${source})\\b`;
  const flags = state.matchCase ? "g" : "gi";
  try {
    return new RegExp(source, flags);
  } catch {
    return null;
  }
}

/** All non-overlapping matches of the query within `text`. */
export function computeMatches(text: string, state: FindState): FindMatch[] {
  const re = buildRegex(state);
  if (!re) return [];
  const out: FindMatch[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length });
    if (m.index === re.lastIndex) re.lastIndex += 1; // avoid zero-length loop
  }
  return out;
}

/** Adapter a concrete editor implements so the shared search engine can drive it. */
export interface SearchAdapter {
  getText: () => string;
  /** Current caret/selection start in text coordinates (for "find from here"). */
  selectionStart: () => number;
  select: (start: number, end: number) => void;
  replace: (start: number, end: number, withText: string) => void;
}

export interface TextSearch {
  find: (state: FindState) => number;
  next: (state: FindState) => void;
  prev: (state: FindState) => void;
  replaceCurrent: (state: FindState) => void;
  replaceAll: (state: FindState) => number;
}

/** Shared find/replace engine usable by any linear-text editor surface. */
export function createTextSearch(adapter: SearchAdapter): TextSearch {
  let matches: FindMatch[] = [];
  let index = -1;

  const recompute = (state: FindState) => {
    matches = computeMatches(adapter.getText(), state);
  };

  const selectAt = (i: number) => {
    if (i < 0 || i >= matches.length) return;
    index = i;
    adapter.select(matches[i].start, matches[i].end);
  };

  return {
    find: (state) => {
      recompute(state);
      if (!matches.length) {
        index = -1;
        return 0;
      }
      const from = adapter.selectionStart();
      const i = matches.findIndex((m) => m.start >= from);
      selectAt(i >= 0 ? i : 0);
      return matches.length;
    },
    next: (state) => {
      recompute(state);
      if (!matches.length) return;
      selectAt((index + 1) % matches.length);
    },
    prev: (state) => {
      recompute(state);
      if (!matches.length) return;
      selectAt((index - 1 + matches.length) % matches.length);
    },
    replaceCurrent: (state) => {
      recompute(state);
      if (!matches.length) return;
      if (index < 0 || index >= matches.length) index = 0;
      const m = matches[index];
      const replacement = state.regex
        ? (adapter.getText().slice(m.start, m.end).replace(buildRegex(state)!, state.replacement))
        : state.replacement;
      adapter.replace(m.start, m.end, replacement);
      recompute(state);
      if (matches.length) selectAt(Math.min(index, matches.length - 1));
    },
    replaceAll: (state) => {
      recompute(state);
      const count = matches.length;
      // replace from the end so earlier offsets stay valid
      for (let i = matches.length - 1; i >= 0; i -= 1) {
        const m = matches[i];
        const replacement = state.regex
          ? adapter.getText().slice(m.start, m.end).replace(buildRegex(state)!, state.replacement)
          : state.replacement;
        adapter.replace(m.start, m.end, replacement);
      }
      matches = [];
      index = -1;
      return count;
    },
  };
}
