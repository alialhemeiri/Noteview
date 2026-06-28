import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUp, ArrowDown, X, CaseSensitive, WholeWord, Regex } from "lucide-react";
import { useUI } from "../state/ui";
import { bridge } from "../state/editorBridge";

export default function FindReplace() {
  const { t } = useTranslation();
  const open = useUI((s) => s.findOpen);
  const replaceMode = useUI((s) => s.findReplaceMode);
  const state = useUI((s) => s.findState);
  const setFindState = useUI((s) => s.setFindState);
  const close = useUI((s) => s.closeFind);
  const showToast = useUI((s) => s.showToast);
  const [count, setCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open, replaceMode]);

  useEffect(() => {
    if (!open) return;
    setCount(state.query ? (bridge.current?.find(state) ?? 0) : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.query, state.matchCase, state.wholeWord, state.regex, open]);

  if (!open) return null;

  const next = () => bridge.current?.findNext(state);
  const prev = () => bridge.current?.findPrev(state);
  const doReplace = () => {
    bridge.current?.replaceCurrent(state);
    setCount(bridge.current?.find(state) ?? 0);
  };
  const doReplaceAll = () => {
    const n = bridge.current?.replaceAll(state) ?? 0;
    showToast(t("find.replacedAll", { count: n }));
    setCount(0);
  };
  const onClose = () => {
    close();
    bridge.current?.closeFind();
  };

  return (
    <div className="nv-find" dir="ltr">
      <div className="nv-find-row">
        <input
          ref={inputRef}
          className="nv-find-input allow-select"
          placeholder={t("find.findPlaceholder")}
          value={state.query}
          onChange={(e) => setFindState({ query: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); e.shiftKey ? prev() : next(); }
            if (e.key === "Escape") onClose();
          }}
        />
        <span className="nv-find-count">{state.query ? (count ? `${count}` : t("find.noResults")) : ""}</span>
        <button className="nv-icon-btn" title={t("find.previous")} onClick={prev}><ArrowUp size={15} /></button>
        <button className="nv-icon-btn" title={t("find.next")} onClick={next}><ArrowDown size={15} /></button>
        <div className="nv-find-opts">
          <button className={`nv-icon-btn ${state.matchCase ? "on" : ""}`} title={t("find.matchCase")} onClick={() => setFindState({ matchCase: !state.matchCase })}><CaseSensitive size={15} /></button>
          <button className={`nv-icon-btn ${state.wholeWord ? "on" : ""}`} title={t("find.wholeWord")} onClick={() => setFindState({ wholeWord: !state.wholeWord })}><WholeWord size={15} /></button>
          <button className={`nv-icon-btn ${state.regex ? "on" : ""}`} title={t("find.regex")} onClick={() => setFindState({ regex: !state.regex })}><Regex size={15} /></button>
        </div>
        <button className="nv-icon-btn" title={t("common.close")} onClick={onClose}><X size={15} /></button>
      </div>
      {replaceMode && (
        <div className="nv-find-row">
          <input
            className="nv-find-input allow-select"
            placeholder={t("find.replacePlaceholder")}
            value={state.replacement}
            onChange={(e) => setFindState({ replacement: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
          />
          <button className="nv-text-btn" onClick={doReplace}>{t("find.replace")}</button>
          <button className="nv-text-btn" onClick={doReplaceAll}>{t("find.replaceAll")}</button>
        </div>
      )}
    </div>
  );
}
