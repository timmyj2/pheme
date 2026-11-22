import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { initToken } from "./api.ts";
import { applyTheme } from "./themes/presets.ts";
import "./styles.css";

initToken();
applyTheme("pheme-dark");
createRoot(document.getElementById("root")!).render(<App />);
