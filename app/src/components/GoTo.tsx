import { useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "./Modal";
import { useUI } from "../state/ui";
import { bridge } from "../state/editorBridge";

export default function GoTo() {
  const { t } = useTranslation();
  const open = useUI((s) => s.gotoOpen);
  const close = useUI((s) => s.closeGoto);
  const [value, setValue] = useState("");
  if (!open) return null;

  const go = () => {
    const n = parseInt(value, 10);
    if (!Number.isNaN(n)) bridge.current?.gotoLine(n);
    close();
    setValue("");
  };

  return (
    <Modal
      title={t("goto.title")}
      onClose={close}
      footer={
        <>
          <button className="nv-btn" onClick={close}>{t("dialog.cancel")}</button>
          <button className="nv-btn primary" onClick={go}>{t("goto.go")}</button>
        </>
      }
    >
      <input
        className="nv-input allow-select"
        type="number"
        min={1}
        autoFocus
        placeholder={t("goto.placeholder")}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") go(); }}
      />
    </Modal>
  );
}
