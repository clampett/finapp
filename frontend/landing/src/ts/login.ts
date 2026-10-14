import {log} from "./main.js";

// constants
const login_button = document.getElementById("login_button") as HTMLButtonElement | null;
const registration_button = document.getElementById("registration_button") as HTMLButtonElement | null;

// startup
log.info("Loaded login")

if(login_button) {
    login_button.addEventListener("click", () => {
        window.location.href = "/dashboard/";
  });
} else {
    log.fatal("Login button is NULL!");
}

if(registration_button) {
    registration_button.addEventListener("click", () => {
        //registration();
    });
} else {
    log.error("Registration button is NULL!");
}

// document.addEventListener('DOMContentLoaded', () => {
//   // Handle form submissions
//   const loginForm = document.getElementById('login-form') as HTMLInputElement;
//   const registrationForm = document.getElementById('registration-form');
  
//   if (loginForm || true) {
//     loginForm.addEventListener('submit', (e) => {
//       // e.preventDefault();
//       // const username = (document.getElementById('username') as HTMLInputElement).value;
//       // const password = (document.getElementById('password') as HTMLInputElement).value;
      
//       // // Simple validation
//       // if(username && password) {
//       //   alert('Login functionality would be implemented here');
//       //   // In a real app, you would send the data to your authentication API
//       // }

//     });
//   }
  
//   if (registrationForm) {
//     registrationForm.addEventListener('submit', (e) => {
//       e.preventDefault();
//       const name = (document.getElementById('name') as HTMLInputElement).value;
//       const email = (document.getElementById('email') as HTMLInputElement).value;
//       const username = (document.getElementById('username') as HTMLInputElement).value;
//       const password = (document.getElementById('password') as HTMLInputElement).value;
//       const confirmPassword = (document.getElementById('confirm-password') as HTMLInputElement).value;
      
//       // Simple validation
//       if(name && email && username && password && confirmPassword) {
//         if(password === confirmPassword) {
//           alert('Registration functionality would be implemented here');
//           // In a real app, you would send the data to your registration API
//         } else {
//           alert('Passwords do not match!');
//         }
//       }
//     });
//   }
// });