console.log("login loaded")

const button = document.getElementById("loginButton")

button?.addEventListener("click", () => {
  window.location.href = "/dashboard/";
});