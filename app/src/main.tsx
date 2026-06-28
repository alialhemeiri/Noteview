import ReactDOM from "react-dom/client";
import "./i18n";
import "katex/dist/katex.min.css";
import "./styles/base.css";
import "./styles/app.css";
import "./styles/editor.css";
import App from "./App";

// StrictMode is intentionally omitted: its double-invoke of effects in dev
// conflicts with the imperative lifecycles of TipTap / CodeMirror instances.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
