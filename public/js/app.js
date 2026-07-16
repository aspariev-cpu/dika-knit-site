/**
 * app.js — Главная страница (дашборд)
 */

document.addEventListener('DOMContentLoaded', async function() {
    const user = await checkAuth();
    if (!user) return;

    document.getElementById('userName').textContent = user.login || 'Пользователь';
    document.getElementById('userAvatar').textContent = (user.login || 'П')[0].toUpperCase();

    await loadDashboard();

    setInterval(loadDashboard, 30000);
});

async function loadDashboard() {
    try {
        const stats = await api.get('/stats');
        if (stats.success) {
            const d = stats.data || {};
            document.getElementById('statToday').textContent = d.totalToday || '--';
            document.getElementById('statTasks').textContent = d.activeTasks || '--';
            document.getElementById('statMachines').textContent =
                `${d.activeMachines || 0}/${d.totalMachines || 15}`;
            document.getElementById('statUrgent').textContent = d.urgentTasks || '--';
        }

        const tasks = await api.get('/tasks');
        if (tasks.success) {
            const data = tasks.data || {};
            const allTasks = [...(data.inProgress || []), ...(data.pending || [])];
            renderTasks(allTasks);
        }

        const machines = await api.get('/machines');
        if (machines.success) {
            renderMachines(machines.data?.machines || []);
        }
    } catch (err) {
        console.error('Dashboard load error:', err);
    }
}

function renderTasks(tasks) {
    const container = document.getElementById('tasksList');
    if (!container) return;

    if (!tasks || tasks.length === 0) {
        container.innerHTML = '<div class="empty-state">📭 Нет активных заданий</div>';
        return;
    }

    container.innerHTML = tasks.slice(0, 5).map(t => {
        const percent = t.plan > 0 ? Math.round((t.done / t.plan) * 100) : 0;
        const urgent = t.urgent ? 'urgent' : '';
        const urgentIcon = t.urgent ? '🔥' : '';

        return `
            <div class="task-item ${urgent}" onclick="window.location.href='/worker'">
                <div class="task-info">
                    <div>
                        <span class="task-id">#${t.id}</span>
                        <span class="task-model">${t.model || '—'}</span>
                        ${urgentIcon}
                    </div>
                    <div class="task-meta">${t.color || '—'} · ${t.done || 0}/${t.plan || 0} шт</div>
                </div>
                <div class="task-progress">
                    <div class="task-bar">
                        <div class="fill" style="width: ${Math.min(percent, 100)}%"></div>
                    </div>
                    <span class="task-percent">${percent}%</span>
                </div>
            </div>
        `;
    }).join('');

    document.getElementById('tasksCount').textContent = tasks.length;
}

function renderMachines(machines) {
    const container = document.getElementById('machinesGrid');
    if (!container) return;

    if (!machines || machines.length === 0) {
        container.innerHTML = '<div class="empty-state">🖥️ Нет данных о станках</div>';
        return;
    }

    container.innerHTML = machines.map(m => {
        const status = m.isRunning ? '🟢' : '⚪';
        const hours = Math.floor((m.workedMinutes || 0) / 60);
        const mins = (m.workedMinutes || 0) % 60;
        const timeStr = m.isRunning ? `⏱️ ${hours > 0 ? hours + 'ч ' + mins + 'м' : mins + 'м'}` : '';

        return `
            <div class="machine-card" onclick="window.location.href='/worker'">
                <div class="machine-number">№${m.number || m.id}</div>
                <div class="machine-status">${status}</div>
                ${timeStr ? `<div class="machine-time">${timeStr}</div>` : ''}
                <div class="machine-helper">👤 ${m.hasHelper ? '✅' : '❌'}</div>
            </div>
        `;
    }).join('');

    const active = machines.filter(m => m.isRunning).length;
    document.getElementById('machinesCount').textContent = `${active}/${machines.length}`;
}

async function logout() {
    api.clearToken();
    showToast('👋 Вы вышли', 'info');
    setTimeout(() => window.location.href = '/login.html', 400);
}

function showToast(message, type = 'info') {
    const colors = { success: '#4ade80', error: '#f87171', info: '#c9a959' };

    const existing = document.querySelector('.toast-container');
    if (existing) existing.remove();

    const container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
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