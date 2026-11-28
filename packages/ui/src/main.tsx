import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { initToken } from "./api.ts";
import { ToastProvider } from "./toast.tsx";
import "./tailwind.css";
import "./tokens.css";
import "./styles.css";
import "./app.css";

initToken();
createRoot(document.getElementById("root")!).render(
  <ToastProvider>
    <App />
  </ToastProvider>,
);
