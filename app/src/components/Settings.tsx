import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Modal from "./Modal";
import { useStore } from "../state/store";
import { useUI } from "../state/ui";
import i18n from "../i18n";
import type { Language, SaveFormat, ThemeChoice } from "../types";

const FONTS = ["Inter", "Lora", "JetBrains Mono", "Georgia", "Arial", "Times New Roman", "Calibri", "Noto Naskh Arabic", "Amiri"];
const DICTS = ["en-US", "en-GB", "ar", "fr-FR", "es-ES", "de-DE"];

function Row({ label, desc, control }: { label: string; desc?: string; control: ReactNode }) {
  return (
    <div className="nv-set-row">
      <div className="nv-set-label">
        <span>{label}</span>
        {desc && <small>{desc}</small>}
      </div>
      <div className="nv-set-control">{control}</div>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className={`nv-switch ${on ? "on" : ""}`} role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <span className="nv-switch-knob" />
    </button>
  );
}

export default function Settings() {
  const { t } = useTranslation();
  const open = useUI((s) => s.settingsOpen);
  const close = useUI((s) => s.closeSettings);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const page = useStore((s) => s.pageSetup);
  const setPageSetup = useStore((s) => s.setPageSetup);
  if (!open) return null;

  const setLang = (lng: Language) => {
    updateSettings({ language: lng });
    void i18n.changeLanguage(lng);
  };

  return (
    <Modal title={t("settings.title")} onClose={close} wide footer={<button className="nv-btn primary" onClick={close}>{t("settings.close")}</button>}>
      <div className="nv-settings">
        <h3 className="nv-set-head">{t("settings.appearance")}</h3>
        <Row
          label={t("settings.theme")}
          control={
            <div className="nv-segmented">
              {(["light", "dark", "system"] as ThemeChoice[]).map((th) => (
                <button key={th} className={settings.theme === th ? "active" : ""} onClick={() => updateSettings({ theme: th })}>
                  {t(`settings.${th}`)}
                </button>
              ))}
            </div>
          }
        />

        <h3 className="nv-set-head">{t("settings.language")}</h3>
        <Row
          label={t("settings.language")}
          control={
            <select className="nv-input" value={settings.language} onChange={(e) => setLang(e.target.value as Language)}>
              <option value="en">{t("settings.english")}</option>
              <option value="ar">{t("settings.arabic")}</option>
            </select>
          }
        />

        <h3 className="nv-set-head">{t("settings.editor")}</h3>
        <Row
          label={t("settings.defaultMode")}
          control={
            <div className="nv-segmented">
              <button className={settings.defaultMode === "rich" ? "active" : ""} onClick={() => updateSettings({ defaultMode: "rich" })}>{t("toolbar.modeRich")}</button>
              <button className={settings.defaultMode === "markdown" ? "active" : ""} onClick={() => updateSettings({ defaultMode: "markdown" })}>{t("toolbar.modeMarkdown")}</button>
              <button className={settings.defaultMode === "plain" ? "active" : ""} onClick={() => updateSettings({ defaultMode: "plain" })}>{t("toolbar.modePlain")}</button>
            </div>
          }
        />
        <Row
          label={t("settings.defaultFont")}
          control={
            <select className="nv-input" value={settings.defaultFont} onChange={(e) => updateSettings({ defaultFont: e.target.value })}>
              {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          }
        />
        <Row
          label={t("settings.defaultFontSize")}
          control={
            <input className="nv-input nv-input-sm" type="number" min={8} max={72} value={settings.defaultFontSize} onChange={(e) => updateSettings({ defaultFontSize: Number(e.target.value) || 16 })} />
          }
        />
        <Row label={t("settings.wordWrap")} control={<Toggle on={settings.wordWrap} onChange={(v) => updateSettings({ wordWrap: v })} />} />
        <Row
          label={t("settings.defaultSaveFormat")}
          control={
            <select className="nv-input" value={settings.defaultSaveFormat} onChange={(e) => updateSettings({ defaultSaveFormat: e.target.value as SaveFormat })}>
              <option value="md">{t("settings.saveFormatMd")}</option>
              <option value="html">{t("settings.saveFormatHtml")}</option>
              <option value="txt">{t("settings.saveFormatTxt")}</option>
            </select>
          }
        />

        <h3 className="nv-set-head">{t("settings.spelling")}</h3>
        <Row label={t("settings.spellCheck")} desc={t("settings.spellCheckDesc")} control={<Toggle on={settings.spellCheck} onChange={(v) => updateSettings({ spellCheck: v })} />} />
        <Row
          label={t("settings.dictionary")}
          control={
            <select className="nv-input" value={settings.spellLang} disabled={!settings.spellCheck} onChange={(e) => updateSettings({ spellLang: e.target.value })}>
              {DICTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          }
        />
        <Row label={t("settings.autocorrect")} desc={t("settings.autocorrectDesc")} control={<Toggle on={settings.autocorrect} onChange={(v) => updateSettings({ autocorrect: v })} />} />

        <h3 className="nv-set-head">{t("settings.page")}</h3>
        <Row
          label={t("settings.paper")}
          control={
            <select className="nv-input" value={page.paper} onChange={(e) => setPageSetup({ paper: e.target.value as typeof page.paper })}>
              {(["A4", "Letter", "Legal", "A5"] as const).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          }
        />
        <Row label={t("settings.margin")} control={<input className="nv-input nv-input-sm" type="number" min={0} max={50} value={page.marginMm} onChange={(e) => setPageSetup({ marginMm: Number(e.target.value) || 0 })} />} />

        <h3 className="nv-set-head">{t("settings.about")}</h3>
        <p className="nv-about">{t("settings.aboutText")}</p>
        <p className="nv-about nv-muted">Noteview 0.1.0 · Tauri · React</p>
      </div>
    </Modal>
  );
}
