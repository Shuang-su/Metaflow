import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./style.css";
let root = document.getElementById("director-root");
if (!root) {
  root = document.createElement("div");
  root.id = "director-root";
  document.body.appendChild(root);
}
document.title = "Metaflow · Director 实验版";
document.body.classList.add("director-page");
createRoot(root).render(<App />);
