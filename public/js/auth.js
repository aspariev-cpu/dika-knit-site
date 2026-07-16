/**
 * auth.js — Управление авторизацией
 */

async function loginUser(login, password) {
    try {
        const result = await api.login(login, password);
        
        if (result.success) {
            showToast('✅ Вход выполнен успешно!', 'success');
            return { success: true };
        } else {
            showToast(result.error || 'Ошибка входа', 'error');
            return { success: false, error: result.error };
        }
    } catch (err) {
        showToast('Ошибка соединения с сервером', 'error');
        return { success: false, error: err.message };
    }
}

async function logout() {
    api.clearToken();
    showToast('Вы вышли из системы', 'info');
    setTimeout(() => {
        window.location.href = '/login.html';
    }, 500);
}

async function checkAuth() {
    try {
        const result = await api.verify();
        if (!result.success) {
            window.location.href = '/login.html';
            return false;
        }
        return result.user;
    } catch (err) {
        window.location.href = '/login.html';
        return false;
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer') || (() => {
        const el = document.createElement('div');
        el.id = 'toastContainer';
        el.className = 'toast-container';
        document.body.appendChild(el);
        return el;
    })();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}