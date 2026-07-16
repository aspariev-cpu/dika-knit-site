/**
 * admin.js — Логика админ-панели
 */

// ========================================
//  ИНИЦИАЛИЗАЦИЯ
// ========================================

document.addEventListener('DOMContentLoaded', async function() {
    // Проверяем авторизацию
    const user = await checkAuth();
    if (!user) return;

    // Показываем имя
    document.getElementById('userName').textContent = user.login || 'Админ';
    document.getElementById('userAvatar').textContent = (user.login || 'A')[0].toUpperCase();

    // Загружаем данные
    await loadAdminData();
    await loadModels();
    await loadColors();
    await loadWorkers();

    // Навигация
    setupNavigation();
    setupSearch();
    setupCreateForm();
});

// ========================================
//  ЗАГРУЗКА ДАННЫХ
// ========================================

async function loadAdminData() {
    try {
        const result = await api.get('/admin/data');
        if (!result.success) {
            showToast('Ошибка загрузки данных', 'error');
            return;
        }

        const data = result.data;
        const tasks = data.tasks || [];

        // Статистика
        document.getElementById('statTotal').textContent = tasks.length;
        document.getElementById('statCompleted').textContent = tasks.filter(t => t.status === 'completed').length;
        document.getElementById('statInProgress').textContent = tasks.filter(t => t.status === 'in_progress').length;
        document.getElementById('statPending').textContent = tasks.filter(t => t.status === 'pending').length;

        // Таблица
        renderTasksTable(tasks);
    } catch (err) {
        console.error('Ошибка загрузки админ-данных:', err);
        showToast('Ошибка загрузки данных', 'error');
    }
}

function renderTasksTable(tasks) {
    const tbody = document.getElementById('tasksTableBody');
    if (!tasks || tasks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#475569;">📭 Нет заданий</td></tr>';
        return;
    }

    tbody.innerHTML = tasks.map(task => {
        const isCoat = task.isCoat || false;
        let done = task.doneQuantity || 0;
        let plan = task.planQuantity || 0;
        if (isCoat && task.parts) {
            plan = task.parts.reduce((s, p) => s + (p.planQuantity || 0), 0);
            done = task.parts.reduce((s, p) => s + Math.min(p.doneQuantity || 0, p.planQuantity || 0), 0);
        }
        const percent = plan > 0 ? Math.min((done / plan) * 100, 100) : 0;
        const statusClass = task.status === 'completed' ? 'status-completed' : 
                           task.status === 'in_progress' ? 'status-in_progress' : 'status-pending';
        const statusText = task.status === 'completed' ? '✅ Готов' :
                          task.status === 'in_progress' ? '🔄 В работе' : '⏳ Ожидает';

        return `
            <tr data-task-id="${task.id}">
                <td>
                    ${task.Model ? task.Model.name : '—'}
                    ${isCoat ? '<span style="font-size:9px; color:#c9a959; display:block;">🧥 Кофта</span>' : ''}
                    ${task.isUrgent ? '<span style="color:#f87171;">🔥</span>' : ''}
                </td>
                <td>${task.Color ? task.Color.name : '—'}</td>
                <td>${plan}</td>
                <td>
                    ${done}/${plan}
                    <div class="progress-mini"><div class="fill" style="width:${percent}%"></div></div>
                </td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>
                    <div class="action-btns">
                        <button class="btn-act btn-edit" onclick="editTask(${task.id})">✏️</button>
                        <button class="btn-act btn-duplicate" onclick="duplicateTask(${task.id})">🔄</button>
                        <button class="btn-act btn-delete" onclick="deleteTask(${task.id})">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Обновляем счётчик поиска
    updateSearchCount();
}

// ========================================
//  ПОИСК
// ========================================

function setupSearch() {
    const input = document.getElementById('taskSearch');
    if (!input) return;

    input.addEventListener('input', function() {
        const filter = this.value.toLowerCase().trim();
        const rows = document.querySelectorAll('#tasksTableBody tr');
        let visible = 0;

        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            const show = text.includes(filter);
            row.style.display = show ? '' : 'none';
            if (show) visible++;
        });

        document.getElementById('searchCount').textContent = visible;
    });
}

function updateSearchCount() {
    const visible = document.querySelectorAll('#tasksTableBody tr[style*="display: none"]');
    const total = document.querySelectorAll('#tasksTableBody tr').length;
    const count = total - visible.length;
    document.getElementById('searchCount').textContent = count;
}

// ========================================
//  СОЗДАНИЕ ЗАДАНИЯ
// ========================================

function setupCreateForm() {
    const form = document.getElementById('createTaskForm');
    if (!form) return;

    // Загружаем модели и цвета
    loadModelSelect();
    loadColorSelects();

    // Обработчик изменения модели (показываем поля для кофты)
    document.getElementById('createModel').addEventListener('change', function() {
        const modelId = this.value;
        const model = window.modelsData?.find(m => m.id == modelId);
        if (model && model.isCoat) {
            document.getElementById('shapkaFields').style.display = 'none';
            document.getElementById('coatFields').style.display = 'block';
            renderCoatParts(model);
        } else {
            document.getElementById('shapkaFields').style.display = 'block';
            document.getElementById('coatFields').style.display = 'none';
        }
    });

    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        await createTask();
    });
}

async function loadModelSelect() {
    try {
        const result = await api.get('/models');
        if (!result.success) return;
        window.modelsData = result.data || [];

        const select = document.getElementById('createModel');
        select.innerHTML = '<option value="">Выберите модель...</option>';
        window.modelsData.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.name + (m.isCoat ? ' 🧥' : '');
            select.appendChild(opt);
        });
    } catch (err) {
        console.error('Ошибка загрузки моделей:', err);
    }
}

async function loadColorSelects() {
    try {
        const result = await api.get('/colors');
        if (!result.success) return;
        const colors = result.data || [];

        ['createColor', 'createColor2'].forEach(id => {
            const select = document.getElementById(id);
            if (!select) return;
            select.innerHTML = id === 'createColor2' ? '<option value="">Без доп. цвета</option>' : '<option value="">Выберите цвет...</option>';
            colors.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.name;
                select.appendChild(opt);
            });
        });
    } catch (err) {
        console.error('Ошибка загрузки цветов:', err);
    }
}

function renderCoatParts(model) {
    const container = document.getElementById('coatPartsContainer');
    if (!model || !model.parts || model.parts.length === 0) {
        container.innerHTML = '<div style="color:#475569; font-size:13px;">У модели нет деталей</div>';
        return;
    }
    container.innerHTML = model.parts.map(part => `
        <div class="part-field">
            <label>${part.partName}</label>
            <input type="number" name="part_${part.id}" placeholder="шт." min="0">
        </div>
    `).join('');
}

async function createTask() {
    const modelId = document.getElementById('createModel').value;
    const colorId = document.getElementById('createColor').value;
    const colorId2 = document.getElementById('createColor2').value;
    const ip = document.getElementById('createIp').value;
    const isUrgent = document.getElementById('createUrgent').checked;

    if (!modelId || !colorId || !ip) {
        showToast('Заполните все обязательные поля', 'error');
        return;
    }

    const model = window.modelsData?.find(m => m.id == modelId);
    const data = { modelId, colorId, colorId2, isUrgent, ip };

    if (model && model.isCoat) {
        // Кофта — собираем детали
        const parts = {};
        document.querySelectorAll('#coatPartsContainer input').forEach(input => {
            const name = input.getAttribute('name');
            const value = parseInt(input.value) || 0;
            if (value > 0) parts[name] = value;
        });
        if (Object.keys(parts).length === 0) {
            showToast('Укажите количество хотя бы для одной детали', 'error');
            return;
        }
        data.parts = parts;
    } else {
        // Шапка
        const quantity = parseInt(document.getElementById('createQuantity').value);
        if (!quantity || quantity < 1) {
            showToast('Укажите количество', 'error');
            return;
        }
        data.quantity = quantity;
    }

    try {
        const result = await api.post('/tasks', data);
        if (result.success) {
            showToast('✅ Задание создано!', 'success');
            document.getElementById('createTaskForm').reset();
            await loadAdminData();
            // Переключаемся на дашборд
            switchTab('dashboard');
        } else {
            showToast(result.error || 'Ошибка создания', 'error');
        }
    } catch (err) {
        console.error('Ошибка создания:', err);
        showToast('Ошибка создания задания', 'error');
    }
}

// ========================================
//  РЕДАКТИРОВАНИЕ ЗАДАНИЯ
// ========================================

async function editTask(taskId) {
    const modal = document.getElementById('editTaskModal');
    modal.classList.add('active');
    document.getElementById('editTaskId').textContent = taskId;

    try {
        const result = await api.get(`/tasks/${taskId}`);
        if (!result.success) {
            showToast('Ошибка загрузки', 'error');
            return;
        }
        const task = result.data;
        document.getElementById('editQuantity').value = task.planQuantity || 0;
        document.getElementById('editDone').value = task.doneQuantity || 0;
        document.getElementById('editStatus').value = task.status || 'pending';
    } catch (err) {
        console.error('Ошибка:', err);
        showToast('Ошибка загрузки задания', 'error');
    }

    document.getElementById('editTaskForm').onsubmit = async function(e) {
        e.preventDefault();
        const data = {
            quantity: parseInt(document.getElementById('editQuantity').value) || 0,
            doneQuantity: parseInt(document.getElementById('editDone').value) || 0,
            status: document.getElementById('editStatus').value
        };
        try {
            const result = await api.post(`/tasks/edit/${taskId}`, data);
            if (result.success) {
                showToast('✅ Изменения сохранены', 'success');
                closeModal('editTaskModal');
                await loadAdminData();
            } else {
                showToast(result.error || 'Ошибка', 'error');
            }
        } catch (err) {
            console.error('Ошибка:', err);
            showToast('Ошибка сохранения', 'error');
        }
    };
}

async function duplicateTask(taskId) {
    if (!confirm(`Дублировать задание #${taskId}?`)) return;
    try {
        const result = await api.post(`/tasks/duplicate/${taskId}`);
        if (result.success) {
            showToast('✅ Задание дублировано', 'success');
            await loadAdminData();
        } else {
            showToast(result.error || 'Ошибка', 'error');
        }
    } catch (err) {
        console.error('Ошибка:', err);
        showToast('Ошибка дублирования', 'error');
    }
}

async function deleteTask(taskId) {
    if (!confirm(`Удалить задание #${taskId}?`)) return;
    try {
        const result = await api.post(`/tasks/delete/${taskId}`);
        if (result.success) {
            showToast('🗑️ Задание удалено', 'info');
            await loadAdminData();
        } else {
            showToast(result.error || 'Ошибка', 'error');
        }
    } catch (err) {
        console.error('Ошибка:', err);
        showToast('Ошибка удаления', 'error');
    }
}

// ========================================
//  МОДЕЛИ, ЦВЕТА, СОТРУДНИКИ
// ========================================

async function loadModels() {
    try {
        const result = await api.get('/models');
        if (!result.success) return;
        const models = result.data || [];

        const tbody = document.getElementById('modelsTableBody');
        if (!models.length) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#475569;">📭 Нет моделей</td></tr>';
            return;
        }

        tbody.innerHTML = models.map(m => `
            <tr>
                <td>${m.name}</td>
                <td>${m.program || '—'}</td>
                <td>${m.isCoat ? '🧥 Кофта' : '🧢 Шапка'}</td>
                <td>
                    <div class="action-btns">
                        <button class="btn-act btn-delete" onclick="deleteModel(${m.id})">🗑️</button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Ошибка загрузки моделей:', err);
    }
}

async function deleteModel(modelId) {
    if (!confirm('Удалить модель?')) return;
    try {
        const result = await api.post(`/models/delete/${modelId}`);
        if (result.success) {
            showToast('✅ Модель удалена', 'success');
            await loadModels();
            await loadModelSelect();
        } else {
            showToast(result.error || 'Ошибка', 'error');
        }
    } catch (err) {
        console.error('Ошибка:', err);
        showToast('Ошибка удаления', 'error');
    }
}

async function loadColors() {
    try {
        const result = await api.get('/colors');
        if (!result.success) return;
        const colors = result.data || [];

        const tbody = document.getElementById('colorsTableBody');
        if (!colors.length) {
            tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; padding:20px; color:#475569;">📭 Нет цветов</td></tr>';
            return;
        }

        tbody.innerHTML = colors.map(c => `
            <tr>
                <td><span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:${c.color || '#c9a959'}; margin-right:8px;"></span>${c.name}</td>
                <td>
                    <div class="action-btns">
                        <button class="btn-act btn-delete" onclick="deleteColor(${c.id})">🗑️</button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Ошибка загрузки цветов:', err);
    }
}

async function deleteColor(colorId) {
    if (!confirm('Удалить цвет?')) return;
    try {
        const result = await api.post(`/colors/delete/${colorId}`);
        if (result.success) {
            showToast('✅ Цвет удалён', 'success');
            await loadColors();
            await loadColorSelects();
        } else {
            showToast(result.error || 'Ошибка', 'error');
        }
    } catch (err) {
        console.error('Ошибка:', err);
        showToast('Ошибка удаления', 'error');
    }
}

async function loadWorkers() {
    try {
        const result = await api.get('/workers');
        if (!result.success) return;
        const workers = result.data || [];

        const tbody = document.getElementById('workersTableBody');
        if (!workers.length) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px; color:#475569;">📭 Нет сотрудников</td></tr>';
            return;
        }

        tbody.innerHTML = workers.map(w => `
            <tr>
                <td>${w.fullName}</td>
                <td>${w.login}</td>
                <td>
                    <div class="action-btns">
                        <button class="btn-act btn-delete" onclick="deleteWorker(${w.id})">🗑️</button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Ошибка загрузки сотрудников:', err);
    }
}

async function deleteWorker(workerId) {
    if (!confirm('Удалить сотрудника?')) return;
    try {
        const result = await api.post(`/workers/delete/${workerId}`);
        if (result.success) {
            showToast('✅ Сотрудник удалён', 'success');
            await loadWorkers();
        } else {
            showToast(result.error || 'Ошибка', 'error');
        }
    } catch (err) {
        console.error('Ошибка:', err);
        showToast('Ошибка удаления', 'error');
    }
}

// ========================================
//  МОДАЛКИ
// ========================================

function openModelModal() {
    document.getElementById('modelModal').classList.add('active');
    document.getElementById('modelForm').onsubmit = async function(e) {
        e.preventDefault();
        const data = {
            name: document.getElementById('modelName').value,
            program: document.getElementById('modelProgram').value,
            size: document.getElementById('modelSize').value,
            className: document.getElementById('modelClass').value,
            yarn: document.getElementById('modelYarn').value,
            isCoat: document.getElementById('modelType').value === 'true'
        };
        try {
            const result = await api.post('/models', data);
            if (result.success) {
                showToast('✅ Модель создана', 'success');
                closeModal('modelModal');
                await loadModels();
                await loadModelSelect();
            } else {
                showToast(result.error || 'Ошибка', 'error');
            }
        } catch (err) {
            console.error('Ошибка:', err);
            showToast('Ошибка создания', 'error');
        }
    };
}

function openColorModal() {
    document.getElementById('colorModal').classList.add('active');
    document.getElementById('colorForm').onsubmit = async function(e) {
        e.preventDefault();
        const name = document.getElementById('colorName').value;
        try {
            const result = await api.post('/colors', { name });
            if (result.success) {
                showToast('✅ Цвет создан', 'success');
                closeModal('colorModal');
                await loadColors();
                await loadColorSelects();
            } else {
                showToast(result.error || 'Ошибка', 'error');
            }
        } catch (err) {
            console.error('Ошибка:', err);
            showToast('Ошибка создания', 'error');
        }
    };
}

function openWorkerModal() {
    document.getElementById('workerModal').classList.add('active');
    document.getElementById('workerForm').onsubmit = async function(e) {
        e.preventDefault();
        const data = {
            fullName: document.getElementById('workerFullName').value,
            login: document.getElementById('workerLogin').value,
            password: document.getElementById('workerPassword').value
        };
        try {
            const result = await api.post('/workers', data);
            if (result.success) {
                showToast('✅ Сотрудник создан', 'success');
                closeModal('workerModal');
                await loadWorkers();
            } else {
                showToast(result.error || 'Ошибка', 'error');
            }
        } catch (err) {
            console.error('Ошибка:', err);
            showToast('Ошибка создания', 'error');
        }
    };
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

// Закрытие модалки по клику вне
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
});

// ========================================
//  НАВИГАЦИЯ
// ========================================

function setupNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tab = this.dataset.tab;
            switchTab(tab);
        });
    });
}

function switchTab(tab) {
    // Обновляем кнопки
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`.nav-btn[data-tab="${tab}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    // Обновляем секции
    document.querySelectorAll('.section-tab').forEach(s => s.classList.remove('active'));
    const activeSection = document.getElementById('tab-' + tab);
    if (activeSection) activeSection.classList.add('active');

    // Перезагружаем данные при переключении
    if (tab === 'dashboard') loadAdminData();
    if (tab === 'models') loadModels();
    if (tab === 'colors') loadColors();
    if (tab === 'workers') loadWorkers();
}

// ========================================
//  УВЕДОМЛЕНИЯ
// ========================================

function showToast(message, type = 'info') {
    const colors = { success: '#4ade80', error: '#f87171', info: '#c9a959' };

    const existing = document.querySelector('.toast-mobile');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-mobile';
    toast.style.cssText = `
        position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
        z-index: 9999; width: 90%; max-width: 400px;
        background: rgba(10,14,26,0.95); backdrop-filter: blur(10px);
        padding: 14px 20px; border-radius: 12px;
        border-left: 4px solid ${colors[type] || colors.info};
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        color: #fff; font-size: 14px; font-weight: 500;
        text-align: center;
        animation: slideUp 0.4s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Добавляем анимацию
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    @keyframes slideUp {
        from { opacity: 0; transform: translateX(-50%) translateY(20px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
`;
document.head.appendChild(styleSheet);

// ========================================
//  API-ОБЁРТКИ ДЛЯ АДМИНА
// ========================================

// Расширяем api для админских запросов
api.get = async function(endpoint) {
    return await this.request('/api' + endpoint);
};

api.post = async function(endpoint, data) {
    return await this.request('/api' + endpoint, {
        method: 'POST',
        body: JSON.stringify(data)
    });
};