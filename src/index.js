import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

// Ignore les "AbortError" bénignes (requêtes annulées par React/Firestore en dev)
function isAbort(reason) {
  return reason && (reason.name === "AbortError" ||
    (typeof reason.message === "string" && reason.message.includes("aborted")));
}

window.addEventListener("unhandledrejection", (event) => {
  if (isAbort(event.reason)) {
    event.preventDefault();
  }
});

window.addEventListener("error", (event) => {
  if (isAbort(event.error) || (event.message && event.message.includes("aborted"))) {
    event.preventDefault();
  }
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);