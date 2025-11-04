import axios from 'axios';


//(It's now a relative path, so it just uses the current domain)
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

export default api;