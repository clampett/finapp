import { log } from "./main.js";

// Constants
const loginButton = document.getElementById('login_button') as HTMLButtonElement | null;
const registrationForm = document.getElementById('registration-form') as HTMLFormElement | null;
const errorDisplay = document.getElementById('login-error') as HTMLParagraphElement | null;

// Startup
log.info("Loaded login & registration module");

// 1. Handle Login
if (loginButton) {
  loginButton.addEventListener('click', async (e) => {
    e.preventDefault(); // Stop the browser from refreshing the page
    
    const usernameInput = document.getElementById('username') as HTMLInputElement | null;
    const passwordInput = document.getElementById('password') as HTMLInputElement | null;

    if (!usernameInput || !passwordInput) {
      log.warn("Username or password input fields missing in HTML.");
      return;
    }

    const username = usernameInput.value;
    const password = passwordInput.value;

    if (!username || !password) {
      log.warn("Username or password missing.");
      if (errorDisplay) errorDisplay.textContent = "Please fill in all fields.";
      else alert("Please fill in all fields.");
      return;
    }

    try {
      log.info(`Attempting login for user: ${username}`);
      
      // Disable button to prevent double-clicks
      loginButton.disabled = true;
      loginButton.textContent = "Signing In...";

      const response = await fetch('http://localhost:8081/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (response.ok) {
      log.info("Login successful. Redirecting to dashboard...");
      
      // Use sessionStorage for banking-standard tab security
      sessionStorage.setItem('finapp_user_id', data.userId);
      localStorage.removeItem('finapp_user_id'); // Nuke the old bug
      
      window.location.href = "/dashboard/";
    } else {
        log.error("Login failed:", data.message);
        if (errorDisplay) errorDisplay.textContent = data.message || "Invalid credentials.";
        else alert(data.message || "Invalid credentials.");
        
        // Reset button
        loginButton.disabled = false;
        loginButton.textContent = "Sign In";
      }
    } catch (error) {
      log.fatal("Connection to auth server failed:", error);
      if (errorDisplay) errorDisplay.textContent = "Unable to connect to the server. Please try again later.";
      else alert("Unable to connect to the server.");
      
      // Reset button
      loginButton.disabled = false;
      loginButton.textContent = "Sign In";
    }
  });
} else {
  log.warn("Login button not found on this page.");
}

// 2. Handle Registration
if (registrationForm) {
  registrationForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Make sure your registration.html has these IDs
    const username = (document.getElementById('username') as HTMLInputElement).value;
    const email = (document.getElementById('email') as HTMLInputElement).value;
    const password = (document.getElementById('password') as HTMLInputElement).value;
    const confirmPassword = (document.getElementById('confirm-password') as HTMLInputElement).value;
    
    if (password !== confirmPassword) {
      alert("Passwords do not match!");
      return;
    }

    try {
      const response = await fetch('http://localhost:8081/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });

      const data = await response.json();

      if (response.ok) {
        alert("Registration successful! Check your terminal for the verification code.");
        window.location.href = "verify.html"; // Updated to prompt the 6-digit code screen
      } else {
        alert(`Registration failed: ${data.message}`);
      }
    } catch (error) {
      log.fatal("Connection to auth server failed:", error);
      alert("Unable to connect to the server.");
    }
  });
} else {
  log.warn("Registration form not found on this page.");
}