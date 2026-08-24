import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ToastProvider } from "./components/Toasts";

import "./styles/tokens.css";
// The character, right after the units it is written in and before every
// surface that answers to it.
import "./styles/motion.css";
import "./styles/card.css";
import "./styles/app.css";
import "./styles/menu.css";
import "./styles/modal.css";
import "./styles/toast.css";
import "./styles/tower.css";

const el = document.getElementById("root");
if (!el) throw new Error("no #root in index.html");

// The provider wraps App rather than living inside it: buying and selling
// happen in App itself, so it has to be a consumer too.
createRoot(el).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
