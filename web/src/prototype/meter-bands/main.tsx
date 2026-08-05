import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MeterBandsPrototype } from "./MeterBandsPrototype.tsx";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");

createRoot(root).render(
  <StrictMode>
    <MeterBandsPrototype />
  </StrictMode>,
);
