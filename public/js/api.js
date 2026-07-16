/**
 * api.js — Клиент для общения с бэкендом
 */

const API_BASE = window.location.origin;

class ApiClient {
    constructor() {
        this.token = localStorage.getItem('token');
        console.log('🔑 ApiClient готов');
    }

    setToken(token) {
        this.token = token;
        localStorage.setItem('token', token);
    }

    clearToken() {
        this.token = null;
        localStorage.removeItem('token');
    }

    async request(endpoint, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        try {
            const response = await fetch(`${API_BASE}${endpoint}`, {
                ...options,
                headers
            });

            if (response.status === 401) {
                this.clearToken();
                window.location.href = '/login.html';
                throw new Error('Сессия истекла');
            }

            return await response.json();
        } catch (err) {
            console.error('❌ API error:', err);
            throw err;
        }
    }

    // === GET ===
    async get(endpoint) {
        return await this.request('/api' + endpoint, { method: 'GET' });
    }

    // === POST ===
    async post(endpoint, data) {
        return await this.request('/api' + endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    // === PUT ===
    async put(endpoint, data) {
        return await this.request('/api' + endpoint, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    // === DELETE ===
    async delete(endpoint) {
        return await this.request('/api' + endpoint, { method: 'DELETE' });
    }

    // === АВТОРИЗАЦИЯ ===
    async login(login, password) {
        const result = await this.post('/auth/login', { login, password });
        if (result.success && result.token) {
            this.setToken(result.token);
        }
        return result;
    }

    async verify() {
        return await this.post('/auth/verify', { token: this.token });
    }
}

const api = new ApiClient();
console.log('✅ api.js загружен');