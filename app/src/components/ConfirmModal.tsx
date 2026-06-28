import { useTranslation } from "react-i18next";
import Modal from "./Modal";
import { useUI } from "../state/ui";

export default function ConfirmModal() {
  const { t } = useTranslation();
  const confirm = useUI((s) => s.confirm);
  const resolve = useUI((s) => s.resolveConfirm);
  if (!confirm) return null;

  return (
    <Modal
      title={t("dialog.unsavedTitle")}
      onClose={() => resolve("cancel")}
      footer={
        <>
          <button className="nv-btn" onClick={() => resolve("cancel")}>{t("dialog.cancel")}</button>
          <button className="nv-btn" onClick={() => resolve("dont")}>{t("dialog.dontSave")}</button>
          <button className="nv-btn primary" onClick={() => resolve("save")}>{t("dialog.save")}</button>
        </>
      }
    >
      <p className="nv-confirm-text">{t("dialog.unsavedBody", { name: confirm.name })}</p>
    </Modal>
  );
}
