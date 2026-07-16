/**
 * auth.js — Управление авторизацией
 */

async function loginUser(login, password) {
    try {
        const result = await api.login(login, password);

        if (result.success) {
            showToast('✅ Вход выполнен успешно!', 'success');
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 400);
            return { success: true };
        } else {
            showToast(result.error || 'Ошибка входа', 'error');
            return { success: false, error: result.error };
        }
    } catch (err) {
        showToast('❌ Ошибка соединения', 'error');
        return { success: false, error: err.message };
    }
}

async function logout() {
    api.clearToken();
    showToast('👋 Вы вышли', 'info');
    setTimeout(() => {
        window.location.href = '/login.html';
    }, 400);
}

async function checkAuth() {
    try {
        const result = await api.verify();
        if (!result.success) {
            window.location.href = '/login.html';
            return null;
        }
        return result.user || { login: 'Пользователь', role: 'worker' };
    } catch (err) {
        console.error('Auth check error:', err);
        window.location.href = '/login.html';
        return null;
    }
}

function showToast(message, type = 'info') {
    const colors = {
        success: '#4ade80',
        error: '#f87171',
        info: '#c9a959'
    };

    const existing = document.querySelector('.toast-container');
    if (existing) existing.remove();

    const container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.style.borderLeftColor = colors[type] || colors.info;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => {
            toast.remove();
            if (container.children.length === 0) container.remove();
        }, 300);
    }, 3000);
}

// Автоматическая проверка при загрузке защищённых страниц
document.addEventListener('DOMContentLoaded', async () => {
    const protectedPages = ['/dashboard', '/admin', '/worker'];
    const currentPath = window.location.pathname;

    if (protectedPages.some(p => currentPath.startsWith(p))) {
        const user = await checkAuth();
        if (user) {
            const nameEl = document.getElementById('userName');
            if (nameEl) nameEl.textContent = user.login || 'Пользователь';
        }
    }
});