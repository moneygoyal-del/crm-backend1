import axios from 'axios';

const API_BASE_URL = "/api/v1"; 

const api = axios.create({
    baseURL: API_BASE_URL
});

// This "interceptor" adds the auth token to every request
api.interceptors.request.use(
    (config) => {
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


api.interceptors.response.use(
    (response) => {
        // Any status code that lie within the range of 2xx cause this function to trigger
        return response;
    },
    (error) => {
        // Any status codes that falls outside the range of 2xx cause this function to trigger
        if (error.response && error.response.status === 401) {
            console.log("Session expired or invalid. Logging out.");
            
            // 1. Clear the expired token
            localStorage.removeItem('authToken');
            localStorage.removeItem('user');
            
            // 2. Redirect to login page
            // We use window.location to force a full page reload, clearing all state.
            window.location.href = '/login';
        }
        
        return Promise.reject(error);
    }
);


export default api;