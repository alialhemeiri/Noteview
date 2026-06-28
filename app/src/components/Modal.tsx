import { useEffect, type ReactNode } from "react";

export default function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="nv-overlay" onMouseDown={onClose}>
      <div
        className={`nv-modal ${wide ? "wide" : ""}`}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="nv-modal-head">
          <h2>{title}</h2>
        </div>
        <div className="nv-modal-body">{children}</div>
        {footer && <div className="nv-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
