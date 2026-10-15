import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Check if user is authenticated
 * @returns {boolean} True if user is authenticated, false otherwise
 */
export function isAuthenticated(): boolean {
    const token = localStorage.getItem('auth_token');
    return !!token;
}

/**
 * Custom hook to redirect unauthenticated users
 */
export function useAuthRedirect() {
    const navigate = useNavigate();
    
    useEffect(() => {
        if (!isAuthenticated()) {
            navigate('/login.html', { replace: true });
        }
    }, [navigate]);
}

/**
 * Logout the current user and redirect to login page
 */
export function logout(): void {
    localStorage.removeItem('auth_token');
    sessionStorage.removeItem('user_id');
}