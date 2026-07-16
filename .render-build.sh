#!/usr/bin/env bash

# .render-build.sh — Автоматическая сборка на Render

echo "🔧 Запуск сборки..."

# Убеждаемся, что папка public/js существует
mkdir -p public/js

# Создаём api.js если его нет
if [ ! -f "public/js/api.js" ]; then
    echo "📄 Создаём api.js..."
    cat > public/js/api.js << 'EOF'
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
    }

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

    async sendCommand(action, args = []) {
        return await this.request(`/api/command/${action}`, {
            method: 'POST',
            body: JSON.stringify({ args })
        });
    }
}

const api = new ApiClient();
console.log('✅ api.js загружен!');
EOF
fi

# Устанавливаем зависимости
npm install

echo "✅ Сборка завершена!"
