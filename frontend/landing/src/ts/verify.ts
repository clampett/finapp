import { log } from "./main.js";

const verifyForm = document.getElementById('verify-form') as HTMLFormElement | null;
const codeInputs = document.querySelectorAll<HTMLInputElement>('.code-input');
const errorDisplay = document.getElementById('verify-error') as HTMLParagraphElement | null;

log.info("Loaded verification module");

// Auto-advance focus between inputs safely
codeInputs.forEach((input, index) => {
  input.addEventListener('input', () => {
    const value = input.value;
    if (value && index < codeInputs.length - 1) {
      const nextInput = codeInputs[index + 1] as HTMLInputElement | undefined;
      nextInput?.focus();
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !input.value && index > 0) {
      const prevInput = codeInputs[index - 1] as HTMLInputElement | undefined;
      prevInput?.focus();
    }
  });
});

// Handle form submission
if (verifyForm) {
  verifyForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Gather all 6 digits into a single string
    let token = "";
    codeInputs.forEach(input => token += input.value);

    if (token.length !== 6) {
      if (errorDisplay) errorDisplay.textContent = "Please enter all 6 digits.";
      return;
    }

    try {
      const response = await fetch('http://localhost:8081/api/v1/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });

      const data = await response.json();

      if (response.ok) {
        alert("Email verified successfully! You can now log in.");
        window.location.href = "/login.html";
      } else {
        if (errorDisplay) errorDisplay.textContent = data.message || "Invalid code.";
      }
    } catch (error) {
      log.fatal("Server connection failed:", error);
      if (errorDisplay) errorDisplay.textContent = "Unable to connect to the server.";
    }
  });
}