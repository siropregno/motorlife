import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

import "./styles/tokens.css";
import "./styles/card.css";
import "./styles/app.css";
import "./styles/menu.css";
import "./styles/tower.css";

const el = document.getElementById("root");
if (!el) throw new Error("no #root in index.html");

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
