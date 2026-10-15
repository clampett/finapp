import {log} from "./main.js";

// Handle form submissions (for login page)
const loginForm = document.getElementById('login-form') as HTMLFormElement | null;
const registrationForm = document.getElementById('registration-form') as HTMLFormElement | null;

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = (document.getElementById('username') as HTMLInputElement).value;
        const password = (document.getElementById('password') as HTMLInputElement).value;
        
        // Simple validation
        if(username && password) {
            log.info("Login attempt with username:", username);
            
            try {
                // Make actual API call to login endpoint
                // Using explicit backend URL for development purposes
                const response = await fetch('http://localhost:8081/api/v1/auth/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        username: username,
                        password: password
                    })
                });
                
                if (!response.ok) {
                    // Handle authentication failure
                    const errorData = await response.json();
                    throw new Error(errorData.message || 'Authentication failed');
                }
                
                const data = await response.json();
                
                // Store the authentication token (JWT)
                localStorage.setItem('auth_token', data.data.token);
                sessionStorage.setItem('user_id', data.data.id);
                
                // Redirect to dashboard
                window.location.href = "/dashboard/";
                
            } catch (error) {
                log.error("Login error:", error);
                alert('Login failed: ' + (error as Error).message || 'Please check your credentials and try again.');
            }
        } else {
            alert('Please enter both username and password');
        }
    });
}

if (registrationForm) {
    registrationForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = (document.getElementById('name') as HTMLInputElement).value;
        const email = (document.getElementById('email') as HTMLInputElement).value;
        const username = (document.getElementById('username') as HTMLInputElement).value;
        const password = (document.getElementById('password') as HTMLInputElement).value;
        const confirmPassword = (document.getElementById('confirm-password') as HTMLInputElement).value;
        
        // Simple validation
        if(name && email && username && password && confirmPassword) {
            if (password !== confirmPassword) {
                alert('Passwords do not match!');
                return;
            }
            
            log.info("Registration attempt with username:", username);
            
            try {
                // Make actual API call to register endpoint
                const response = await fetch('http://localhost:8081/api/v1/auth/register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        username: username,
                        email: email,
                        password: password
                    })
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || 'Registration failed');
                }
                
                const data = await response.json();
                alert('Registration successful! Please login.');
                window.location.href = '/login.html';
                
            } catch (error) {
                log.error("Registration error:", error);
                alert('Registration failed: ' + (error as Error).message || 'Please try again.');
            }
        } else {
            alert('Please fill in all fields');
        }
    });
}