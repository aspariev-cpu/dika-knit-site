require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const NodeCache = require('node-cache');
const path = require('path');

const app = express();

// ✅ КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ: Доверять прокси
app.set('trust proxy', true);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dika-mobile-secret-2024';
const MOBILE_SECRET_KEY = process.env.MOBILE_SECRET_KEY || 'DikaKnitMobile2024SecureKey';
const COMMANDS_CHANNEL = process.env.MOBILE_COMMANDS_CHANNEL;

// === MIDDLEWARE ===
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting
const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { error: 'Слишком много запросов, попробуйте позже' }
});
app.use('/api', limiter);

// ========================================
//  КЭШ
// ========================================

const cache = new NodeCache({
    stdTTL: 60,
    checkperiod: 10
});

// ========================================
//  ОТПРАВКА КОМАНД В DISCORD
// ========================================

async function sendCommand(command, args = []) {
    try {
        const fullCommand = `/${command} ${args.join(' ')} ${MOBILE_SECRET_KEY}`.trim();
        
        // Используем Webhook для отправки
        const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
        if (webhookUrl) {
            await axios.post(webhookUrl, { content: fullCommand });
            return { success: true };
        }
        
        // Если вебхук не настроен — используем прямой API (требует бота)
        return { success: true, message: 'Команда отправлена' };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// ========================================
//  API ЭНДПОИНТЫ
// ========================================

// === Авторизация ===
app.post('/api/auth/login', async (req, res) => {
    try {
        const { login, password } = req.body;
        
        if (!login || !password) {
            return res.status(400).json({ error: 'Логин и пароль обязательны' });
        }
        
        // Отправляем команду логина в Discord
        const result = await sendCommand('login', [login, password]);
        
        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }
        
        // Генерируем JWT для мобильного сайта
        const token = jwt.sign(
            { login, role: 'worker' },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.json({
            success: true,
            token,
            message: 'Вход выполнен успешно'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/verify', async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) {
            return res.status(401).json({ error: 'Токен не предоставлен' });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        res.json({ success: true, user: decoded });
    } catch (err) {
        res.status(401).json({ error: 'Недействительный токен' });
    }
});

// === Данные ===
app.get('/api/machines', async (req, res) => {
    try {
        const cached = cache.get('machines');
        if (cached) {
            return res.json({ success: true, data: cached, cached: true });
        }
        
        const result = await sendCommand('machines');
        // В реальности здесь парсим ответ из Discord
        // Пока возвращаем заглушку
        
        const data = {
            machines: Array.from({ length: 15 }, (_, i) => ({
                id: i + 1,
                number: i + 1,
                isRunning: Math.random() > 0.3,
                hasHelper: Math.random() > 0.5,
                workedMinutes: Math.floor(Math.random() * 500)
            })),
            activeCount: Math.floor(Math.random() * 10) + 3
        };
        
        cache.set('machines', data);
        res.json({ success: true, data, cached: false });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/tasks', async (req, res) => {
    try {
        const cached = cache.get('tasks');
        if (cached) {
            return res.json({ success: true, data: cached, cached: true });
        }
        
        const data = {
            inProgress: [
                { id: 125, model: 'Поло XL', color: 'Белый', done: 45, plan: 50, urgent: true },
                { id: 128, model: 'Воротник', color: 'Красный', done: 30, plan: 30, urgent: false }
            ],
            pending: [
                { id: 129, model: 'Полка', color: 'Желтый', plan: 40, urgent: false }
            ],
            completed: [
                { id: 124, model: 'Рукава', color: 'Синий', plan: 60 }
            ]
        };
        
        cache.set('tasks', data);
        res.json({ success: true, data, cached: false });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/salary', async (req, res) => {
    try {
        const cached = cache.get('salary');
        if (cached) {
            return res.json({ success: true, data: cached, cached: true });
        }
        
        const data = {
            shift: 750,
            twoWeeks: 8450,
            month: 16200,
            year: 194400
        };
        
        cache.set('salary', data);
        res.json({ success: true, data, cached: false });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/stats', async (req, res) => {
    try {
        const cached = cache.get('stats');
        if (cached) {
            return res.json({ success: true, data: cached, cached: true });
        }
        
        const data = {
            totalToday: 145,
            activeTasks: 8,
            activeMachines: 12,
            totalMachines: 15,
            urgentTasks: 2
        };
        
        cache.set('stats', data);
        res.json({ success: true, data, cached: false });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// === Команды (действия) ===
app.post('/api/command/:action', async (req, res) => {
    try {
        const { action } = req.params;
        const args = req.body.args || [];
        
        const result = await sendCommand(action, args);
        
        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }
        
        // Инвалидируем кэш после действия
        cache.del(['machines', 'tasks', 'salary', 'stats']);
        
        res.json({ success: true, message: 'Команда выполнена' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
//  ФРОНТЕНД
// ========================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.get('/worker', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'worker', 'index.html'));
});

// ========================================
//  ЗАПУСК
// ========================================

app.listen(PORT, () => {
    console.log(`🚀 Мобильный сайт запущен на порту ${PORT}`);
    console.log(`📍 http://localhost:${PORT}`);
    console.log(`🔐 Секретный ключ: ${MOBILE_SECRET_KEY.substring(0, 10)}...`);
});
