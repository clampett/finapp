import {log} from "./main.js";

// Startup
log.info("Loaded login")

const button = document.getElementById("loginButton")

button?.addEventListener("click", () => {
  window.location.href = "/dashboard/";
});