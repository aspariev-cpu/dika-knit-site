/**
 * api.js — Клиент для общения с бэкендом
 * 
 * Версия: 1.0.0
 * Описание: Полноценный API-клиент для мобильной версии Dika Knit
 */

// ========================================
//  КОНФИГУРАЦИЯ
// ========================================

const API_BASE = window.location.origin;

// ========================================
//  API КЛИЕНТ
// ========================================

class ApiClient {
    constructor() {
        this.token = localStorage.getItem('token');
        console.log('🔑 ApiClient инициализирован');
        console.log(`📦 Токен: ${this.token ? '✅ есть' : '❌ нет'}`);
    }

    // === УПРАВЛЕНИЕ ТОКЕНОМ ===
    setToken(token) {
        this.token = token;
        localStorage.setItem('token', token);
        console.log('✅ Токен сохранён');
    }

    clearToken() {
        this.token = null;
        localStorage.removeItem('token');
        console.log('🗑️ Токен удалён');
    }

    // === БАЗОВЫЙ ЗАПРОС ===
    async request(endpoint, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        console.log(`🌐 ${options.method || 'GET'} ${endpoint}`);

        try {
            const response = await fetch(`${API_BASE}${endpoint}`, {
                ...options,
                headers
            });

            // Если 401 — токен истёк
            if (response.status === 401) {
                console.warn('⚠️ Сессия истекла');
                this.clearToken();
                window.location.href = '/login.html';
                throw new Error('Сессия истекла');
            }

            const data = await response.json();
            console.log(`📦 Ответ от ${endpoint}:`, data);
            return data;
        } catch (err) {
            console.error(`❌ Ошибка ${endpoint}:`, err);
            throw err;
        }
    }

    // === АВТОРИЗАЦИЯ ===
    async login(login, password) {
        console.log(`🔑 Попытка входа: ${login}`);
        try {
            const result = await this.request('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ login, password })
            });

            if (result.success && result.token) {
                this.setToken(result.token);
                console.log('✅ Вход выполнен успешно');
            } else {
                console.warn('⚠️ Ошибка входа:', result.error);
            }

            return result;
        } catch (err) {
            console.error('❌ Ошибка входа:', err);
            return { success: false, error: err.message };
        }
    }

    async verify() {
        console.log('🔍 Проверка авторизации...');
        try {
            const result = await this.request('/api/auth/verify', {
                method: 'POST',
                body: JSON.stringify({ token: this.token })
            });
            console.log(`✅ Авторизация: ${result.success ? 'действительна' : 'недействительна'}`);
            return result;
        } catch (err) {
            console.error('❌ Ошибка проверки:', err);
            return { success: false, error: err.message };
        }
    }

    // === ПОЛУЧЕНИЕ ДАННЫХ ===
    async getStats() {
        return await this.request('/api/stats');
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

    // === ОТПРАВКА КОМАНД ===
    async sendCommand(action, args = []) {
        console.log(`📤 Команда: /${action} ${args.join(' ')}`);
        try {
            const result = await this.request(`/api/command/${action}`, {
                method: 'POST',
                body: JSON.stringify({ args })
            });
            console.log(`✅ Команда ${action} выполнена`);
            return result;
        } catch (err) {
            console.error(`❌ Ошибка команды ${action}:`, err);
            return { success: false, error: err.message };
        }
    }

    // === СПЕЦИАЛЬНЫЕ КОМАНДЫ (для удобства) ===
    async startMachine(number) {
        return await this.sendCommand('start', [number]);
    }

    async stopMachine(number) {
        return await this.sendCommand('stop', [number]);
    }

    async toggleHelper(number, state) {
        return await this.sendCommand('helper', [number, state]);
    }

    async addOperation(taskId, quantity, machineNumber) {
        return await this.sendCommand('add_operation', [taskId, quantity, machineNumber]);
    }

    async completeTask(taskId) {
        return await this.sendCommand('complete', [taskId]);
    }

    async returnTask(taskId) {
        return await this.sendCommand('return', [taskId]);
    }

    async addComment(taskId, text) {
        return await this.sendCommand('comment', [taskId, text]);
    }
}

// ========================================
//  СОЗДАНИЕ ГЛОБАЛЬНОГО ЭКЗЕМПЛЯРА
// ========================================

const api = new ApiClient();
console.log('✅ api.js загружен и готов к работе!');

// Для отладки в консоли
if (window) {
    window.api = api;
    console.log('💡 Для тестов используйте: api.команда()');
}
