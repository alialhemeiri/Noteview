import { useUI } from "../state/ui";

export default function Toast() {
  const toast = useUI((s) => s.toast);
  if (!toast) return null;
  return <div className="nv-toast">{toast}</div>;
}
