/**
 * Check if user is authenticated
 * @returns {boolean} True if user is authenticated, false otherwise
 */
export function isAuthenticated(): boolean {
    const token = localStorage.getItem('auth_token');
    return !!token;
}

/**
 * Redirect unauthenticated user to login page
 */
export function redirectToLoginIfUnauthenticated(): void {
    if (!isAuthenticated()) {
        window.location.href = "/login.html";
    }
}

/**
 * Logout the current user and redirect to login page
 */
export function logout(): void {
    localStorage.removeItem('auth_token');
    sessionStorage.removeItem('user_id');
    window.location.href = "/login.html";
}