import axios from 'axios';

const API_BASE_URL = "/api/v1"; 

const api = axios.create({
    baseURL: API_BASE_URL
});

// --- TypeScript Error Fix: Define explicit types for the queue ---
interface FailedRequest {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
}

// Flag to prevent multiple simultaneous refresh calls
let isRefreshing = false;

// Queue to hold requests that failed due to 401 while token is being refreshed
let failedQueue: FailedRequest[] = [];

// Helper to process the queue once token is refreshed (or fails)
const processQueue = (error: Error | null, token: string | null = null) => {
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

// Helper to clear storage and redirect on critical failure
const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('authTokenExpiry');
    localStorage.removeItem('user');
    window.location.href = '/login';
};

// --- 1. Request Interceptor ---
api.interceptors.request.use(
    (config) => {
        // Always attach the current access token
        const token = localStorage.getItem('authToken');
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// --- 2. Response Interceptor ---
api.interceptors.response.use(
    (response) => {
        return response;
    },
    async (error) => {
        const originalRequest = error.config;

        // If error is 401 Unauthorized AND we haven't retried this request yet
        if (error.response?.status === 401 && !originalRequest._retry) {
            
       
            if (originalRequest.url?.includes('/auth/verify-otp') || 
                originalRequest.url?.includes('/auth/send-otp') ||
                originalRequest.url?.includes('/auth/refresh')) {
                return Promise.reject(error);
            }
            // --- END FIX ---

            if (isRefreshing) {
                // If already refreshing, queue this request
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                }).then(token => {
                    originalRequest.headers['Authorization'] = 'Bearer ' + token;
                    return axios(originalRequest);
                }).catch(err => {
                    return Promise.reject(err);
                });
            }

            originalRequest._retry = true;
            isRefreshing = true;

            const refreshToken = localStorage.getItem('refreshToken');
            
            if (!refreshToken) {
                console.log("No refresh token found. Logging out.");
                handleLogout();
                return Promise.reject(error);
            }

            try {
                // Attempt to get a new access token
                const res = await axios.post(`${API_BASE_URL}/auth/refresh`, 
                    { refreshToken: refreshToken },
                    { headers: { Authorization: localStorage.getItem('authToken') ? `Bearer ${localStorage.getItem('authToken')}` : '' } } 
                );
                
                const { accessToken, accessTokenExpiresAt, refreshToken: newRefreshToken } = res.data.data;

                // Update local storage with new tokens
                localStorage.setItem('authToken', accessToken);
                localStorage.setItem('authTokenExpiry', accessTokenExpiresAt);
                if (newRefreshToken) {
                    localStorage.setItem('refreshToken', newRefreshToken);
                }

                // Retry the original request with the new token
                originalRequest.headers['Authorization'] = `Bearer ${accessToken}`;
                
                // Resume all queued requests
                processQueue(null, accessToken);
                
                return axios(originalRequest);

            } catch (refreshError) {
                // If refresh fails, we must log out
                console.log("Refresh process failed. Logging out.");
                processQueue(refreshError instanceof Error ? refreshError : new Error('Refresh failed'), null);
                handleLogout();
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }
        
        // For all other errors, just return the error
        return Promise.reject(error);
    }
);

export default api;