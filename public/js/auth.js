/**
 * auth.js — Управление авторизацией
 */

// ========================================
//  ВХОД
// ========================================

async function loginUser(login, password) {
    try {
        const result = await api.login(login, password);
        
        if (result.success) {
            showToast('✅ Вход выполнен успешно!', 'success');
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 500);
            return { success: true };
        } else {
            showToast(result.error || 'Ошибка входа', 'error');
            return { success: false, error: result.error };
        }
    } catch (err) {
        showToast('❌ Ошибка соединения с сервером', 'error');
        return { success: false, error: err.message };
    }
}

// ========================================
//  ВЫХОД
// ========================================

async function logout() {
    api.clearToken();
    showToast('👋 Вы вышли из системы', 'info');
    setTimeout(() => {
        window.location.href = '/login.html';
    }, 500);
}

// ========================================
//  ПРОВЕРКА АВТОРИЗАЦИИ
// ========================================

async function checkAuth() {
    try {
        const result = await api.verify();
        if (!result.success) {
            window.location.href = '/login.html';
            return null;
        }
        return result.user || { login: 'Пользователь', role: 'worker' };
    } catch (err) {
        console.error('Ошибка проверки авторизации:', err);
        window.location.href = '/login.html';
        return null;
    }
}

// ========================================
//  УВЕДОМЛЕНИЯ (TOAST)
// ========================================

function showToast(message, type = 'info') {
    // Удаляем старые уведомления
    const oldContainer = document.getElementById('toastContainer');
    if (oldContainer) oldContainer.remove();

    // Создаём контейнер
    const container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);

    // Создаём уведомление
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    // Автоудаление через 3 секунды
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        setTimeout(() => {
            toast.remove();
            if (container.children.length === 0) container.remove();
        }, 300);
    }, 3000);
}

// ========================================
//  АВТОМАТИЧЕСКАЯ ПРОВЕРКА ПРИ ЗАГРУЗКЕ
// ========================================

// Если мы на защищённой странице — проверяем авторизацию
document.addEventListener('DOMContentLoaded', () => {
    const protectedPages = ['/dashboard', '/admin', '/worker'];
    const currentPath = window.location.pathname;

    if (protectedPages.some(p => currentPath.startsWith(p))) {
        checkAuth().then(user => {
            if (user) {
                // Показываем имя пользователя
                const nameEl = document.getElementById('userName');
                if (nameEl) nameEl.textContent = user.login || 'Пользователь';
            }
        });
    }
});
