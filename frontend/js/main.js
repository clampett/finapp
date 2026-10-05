const API_BASE_URL = 'http://localhost:8081/api/v1';

async function checkBackendHealth() {
    try {
        console.log(`Attempting to connect to ${API_BASE_URL}/health...`);
        const response = await fetch(`${API_BASE_URL}/health`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Backend connection successful! Health response:', data);
    } catch (error) {
        console.error('Failed to connect to the backend. Is Spring Boot running?', error);
    }
}

// Execute the check when the script loads
checkBackendHealth();