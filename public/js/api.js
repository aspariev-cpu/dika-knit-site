/**
 * api.js — Клиент для общения с бэкендом
 */

const API_BASE = window.location.origin;

class ApiClient {
    constructor() {
        this.token = localStorage.getItem('token');
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

        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers
        });

        if (response.status === 401) {
            this.clearToken();
            window.location.href = '/login.html';
            throw new Error('Сессия истекла');
        }

        const data = await response.json();
        return data;
    }

    // === АВТОРИЗАЦИЯ ===
    async login(login, password) {
        const result = await this.request('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ login, password })
        });

        if (result.success && result.token) {
            this.setToken(result.token);
        }

        return result;
    }

    async verify() {
        return await this.request('/api/auth/verify', {
            method: 'POST',
            body: JSON.stringify({ token: this.token })
        });
    }

    // === ДАННЫЕ ===
    async getMachines() {
        return await this.request('/api/machines');
    }

    async getTasks() {
        return await this.request('/api/tasks');
    }

    async getSalary() {
        return await this.request('/api/salary');
    }

    async getStats() {
        return await this.request('/api/stats');
    }

    // === КОМАНДЫ ===
    async sendCommand(action, args = []) {
        return await this.request(`/api/command/${action}`, {
            method: 'POST',
            body: JSON.stringify({ args })
        });
    }
}

const api = new ApiClient();