/**
 * app.js — Основная логика мобильного сайта
 */

// ========================================
//  ИНИЦИАЛИЗАЦИЯ
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Dika Knit Mobile загружен');

    // Проверяем авторизацию
    const user = await checkAuth();
    if (!user) return;

    // Показываем имя пользователя
    const userNameEl = document.getElementById('userName');
    if (userNameEl) {
        userNameEl.textContent = user.login || 'Пользователь';
    }

    // Показываем админ-ссылки
    if (user.role === 'admin') {
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = 'block';
        });
    }

    // Загружаем данные
    await loadDashboard();
    await setupTabs();
    startAutoRefresh();
});

// ========================================
//  ЗАГРУЗКА ДАШБОРДА
// ========================================

async function loadDashboard() {
    console.log('📊 Загрузка дашборда...');
    await Promise.all([
        loadStats(),
        loadTasks(),
        loadMachines(),
        loadSalary()
    ]);
}

// ========================================
//  СТАТИСТИКА
// ========================================

async function loadStats() {
    const container = document.getElementById('statsGrid');
    if (!container) return;

    try {
        const result = await api.getStats();
        if (!result.success) {
            console.warn('⚠️ Ошибка загрузки статистики:', result.error);
            return;
        }

        const data = result.data || {};
        document.getElementById('statToday').textContent = data.totalToday || '--';
        document.getElementById('statTasks').textContent = data.activeTasks || '--';
        document.getElementById('statMachines').textContent = 
            `${data.activeMachines || 0}/${data.totalMachines || 15}`;
        document.getElementById('statUrgent').textContent = data.urgentTasks || '--';
    } catch (err) {
        console.error('❌ Ошибка загрузки статистики:', err);
    }
}

// ========================================
//  ЗАДАНИЯ
// ========================================

async function loadTasks() {
    const container = document.getElementById('tasksList');
    if (!container) return;

    try {
        const result = await api.getTasks();
        if (!result.success) {
            container.innerHTML = `<div class="error">❌ ${result.error || 'Ошибка загрузки'}</div>`;
            return;
        }

        const data = result.data || {};
        const allTasks = [...(data.inProgress || []), ...(data.pending || [])];

        if (allTasks.length === 0) {
            container.innerHTML = `<div class="empty">📭 Нет активных заданий</div>`;
            return;
        }

        container.innerHTML = allTasks.slice(0, 5).map(task => {
            const percent = task.plan > 0 ? Math.round((task.done / task.plan) * 100) : 0;
            const urgentClass = task.urgent ? 'urgent' : '';
            const urgentIcon = task.urgent ? '🔥' : '';

            return `
                <div class="task-item ${urgentClass}">
                    <div class="task-info">
                        <div>
                            <span class="task-id">#${task.id}</span>
                            <span class="task-model">${task.model || '—'}</span>
                            ${urgentIcon}
                        </div>
                        <div class="task-meta">${task.color || '—'} · ${task.done || 0}/${task.plan || 0} шт</div>
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

        const countEl = document.getElementById('tasksCount');
        if (countEl) countEl.textContent = allTasks.length;

    } catch (err) {
        console.error('❌ Ошибка загрузки заданий:', err);
        container.innerHTML = `<div class="error">❌ Ошибка загрузки</div>`;
    }
}

// ========================================
//  СТАНКИ
// ========================================

async function loadMachines() {
    const container = document.getElementById('machinesGrid');
    if (!container) return;

    try {
        const result = await api.getMachines();
        if (!result.success) {
            container.innerHTML = `<div class="error">❌ ${result.error || 'Ошибка загрузки'}</div>`;
            return;
        }

        const data = result.data || {};
        const machines = data.machines || [];

        if (machines.length === 0) {
            container.innerHTML = `<div class="empty">🖥️ Нет данных о станках</div>`;
            return;
        }

        container.innerHTML = machines.map(m => {
            const status = m.isRunning ? '🟢' : '⚪';
            const hours = Math.floor((m.workedMinutes || 0) / 60);
            const mins = (m.workedMinutes || 0) % 60;
            const timeStr = hours > 0 ? `${hours}ч ${mins}м` : `${mins}м`;

            return `
                <div class="machine-card">
                    <div class="machine-number">№${m.number || m.id}</div>
                    <div class="machine-status">${status}</div>
                    ${m.isRunning ? `<div class="machine-time">⏱️ ${timeStr}</div>` : ''}
                    <div class="machine-helper">👤 ${m.hasHelper ? '✅' : '❌'}</div>
                    <div class="machine-actions">
                        ${m.isRunning 
                            ? `<button class="btn-stop" onclick="stopMachine(${m.number || m.id})">⏹</button>`
                            : `<button class="btn-start" onclick="startMachine(${m.number || m.id})">▶</button>`
                        }
                        <button class="btn-helper ${m.hasHelper ? 'active' : ''}" 
                                onclick="toggleHelper(${m.number || m.id})">
                            👤
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        const countEl = document.getElementById('machinesCount');
        if (countEl) {
            const active = machines.filter(m => m.isRunning).length;
            countEl.textContent = `${active}/${machines.length}`;
        }

    } catch (err) {
        console.error('❌ Ошибка загрузки станков:', err);
        container.innerHTML = `<div class="error">❌ Ошибка загрузки</div>`;
    }
}

// ========================================
//  ЗАРПЛАТА
// ========================================

async function loadSalary() {
    const container = document.getElementById('salaryWidget');
    if (!container) return;

    try {
        const result = await api.getSalary();
        if (!result.success) {
            container.innerHTML = `<div class="error">❌ ${result.error || 'Ошибка загрузки'}</div>`;
            return;
        }

        const data = result.data || {};

        container.innerHTML = `
            <div class="salary-card">
                <div class="salary-period">Смена</div>
                <div class="salary-value">${data.shift || 0} ₽</div>
            </div>
            <div class="salary-card">
                <div class="salary-period">2 недели</div>
                <div class="salary-value">${data.twoWeeks || 0} ₽</div>
            </div>
            <div class="salary-card">
                <div class="salary-period">Месяц</div>
                <div class="salary-value">${data.month || 0} ₽</div>
            </div>
            <div class="salary-card">
                <div class="salary-period">Год</div>
                <div class="salary-value">${data.year || 0} ₽</div>
            </div>
        `;

    } catch (err) {
        console.error('❌ Ошибка загрузки зарплаты:', err);
        container.innerHTML = `<div class="error">❌ Ошибка загрузки</div>`;
    }
}

// ========================================
//  ВКЛАДКИ
// ========================================

function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    if (!tabs.length) return;

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            const tabId = tab.dataset.tab;
            const content = document.getElementById(`tab-${tabId}`);
            if (content) content.classList.add('active');

            if (tabId === 'machines') loadMachines();
            if (tabId === 'tasks') loadTasks();
            if (tabId === 'salary') loadSalary();
        });
    });
}

// ========================================
//  ДЕЙСТВИЯ СО СТАНКАМИ
// ========================================

async function startMachine(number) {
    try {
        const result = await api.startMachine(number);
        if (result.success) {
            showToast(`✅ Станок №${number} запущен!`, 'success');
            await loadMachines();
        } else {
            showToast(result.error || '❌ Ошибка запуска', 'error');
        }
    } catch (err) {
        showToast('❌ Ошибка соединения', 'error');
    }
}

async function stopMachine(number) {
    try {
        const result = await api.stopMachine(number);
        if (result.success) {
            showToast(`⏹️ Станок №${number} остановлен`, 'info');
            await loadMachines();
        } else {
            showToast(result.error || '❌ Ошибка остановки', 'error');
        }
    } catch (err) {
        showToast('❌ Ошибка соединения', 'error');
    }
}

async function toggleHelper(number) {
    try {
        const btn = document.querySelector(`.machine-card .btn-helper[data-machine="${number}"]`);
        const currentState = btn?.classList.contains('active') ? 'off' : 'on';
        
        const result = await api.toggleHelper(number, currentState);
        if (result.success) {
            showToast(`👤 Срезальщица ${currentState === 'on' ? 'включена' : 'выключена'} на станке №${number}`, 'info');
            await loadMachines();
        } else {
            showToast(result.error || '❌ Ошибка', 'error');
        }
    } catch (err) {
        showToast('❌ Ошибка соединения', 'error');
    }
}

// ========================================
//  АВТООБНОВЛЕНИЕ
// ========================================

let refreshInterval = null;

function startAutoRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
    
    refreshInterval = setInterval(() => {
        const path = window.location.pathname;
        console.log('🔄 Автообновление...');
        
        if (path === '/dashboard' || path === '/') {
            loadDashboard();
        } else if (path === '/worker') {
            const activeTab = document.querySelector('.tab-btn.active');
            if (activeTab) {
                const tabId = activeTab.dataset.tab;
                if (tabId === 'machines') loadMachines();
                if (tabId === 'tasks') loadTasks();
                if (tabId === 'salary') loadSalary();
            }
        }
    }, 30000);
}

// ========================================
//  КОМАНДЫ ДЛЯ КОНСОЛИ (для тестирования)
// ========================================

if (window) {
    window.api = api;
    window.loadMachines = loadMachines;
    window.loadTasks = loadTasks;
    window.loadStats = loadStats;
    window.loadSalary = loadSalary;
    window.startMachine = startMachine;
    window.stopMachine = stopMachine;
    window.toggleHelper = toggleHelper;
    console.log('💡 Доступны команды:');
    console.log('   api.startMachine(3)  — запустить станок');
    console.log('   api.stopMachine(3)   — остановить станок');
    console.log('   loadMachines()       — обновить станки');
    console.log('   loadTasks()          — обновить задания');
}
