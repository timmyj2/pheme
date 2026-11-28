import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { initToken } from "./api.ts";
import { ToastProvider } from "./toast.tsx";
import "./tailwind.css";
import "./tokens.css";
import "./styles.css";
import "./app.css";

initToken();
// Looping animations pause while the window is hidden (tokens.css reads this attribute).
const syncAnimationPause = () => document.documentElement.toggleAttribute("data-renderer-animations-paused", document.hidden);
document.addEventListener("visibilitychange", syncAnimationPause);
syncAnimationPause();
createRoot(document.getElementById("root")!).render(
  <ToastProvider>
    <App />
  </ToastProvider>,
);
