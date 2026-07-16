require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const NodeCache = require('node-cache');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dika-mobile-secret-2024';
const MOBILE_SECRET_KEY = process.env.MOBILE_SECRET_KEY || 'DikaKnitMobile2024SecureKey';
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const COMMANDS_CHANNEL = process.env.MOBILE_COMMANDS_CHANNEL;

// ========================================
//  TRUST PROXY
// ========================================

app.set('trust proxy', 1);

// ========================================
//  RATE LIMITING
// ========================================

const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return req.ip || req.connection?.remoteAddress || 'unknown';
    },
    handler: (req, res) => {
        res.status(429).json({
            error: 'Слишком много запросов. Попробуйте позже.',
            retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
        });
    }
});

// ========================================
//  MIDDLEWARE
// ========================================

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', limiter);

// ========================================
//  КЭШ
// ========================================

const cache = new NodeCache({
    stdTTL: 60,
    checkperiod: 10,
    useClones: false
});

// ========================================
//  МОК-ДАННЫЕ (запасной вариант)
// ========================================

function getMockData(type) {
    const data = {
        machines: {
            machines: Array.from({ length: 15 }, (_, i) => ({
                id: i + 1,
                number: i + 1,
                isRunning: Math.random() > 0.3,
                hasHelper: Math.random() > 0.5,
                workedMinutes: Math.floor(Math.random() * 500)
            })),
            activeCount: Math.floor(Math.random() * 10) + 3
        },
        tasks: {
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
        },
        salary: { shift: 750, twoWeeks: 8450, month: 16200, year: 194400 },
        stats: { totalToday: 145, activeTasks: 8, activeMachines: 12, totalMachines: 15, urgentTasks: 2 }
    };
    return data[type] || {};
}

// ========================================
//  ОТПРАВКА КОМАНД В DISCORD
// ========================================

async function sendDiscordCommand(command, args = []) {
    if (!WEBHOOK_URL) {
        console.warn('⚠️ Webhook не настроен, используем заглушку');
        return null;
    }

    try {
        const fullCommand = `/${command} ${args.join(' ')} ${MOBILE_SECRET_KEY}`.trim();
        await axios.post(WEBHOOK_URL, { content: fullCommand });
        console.log(`✅ Команда отправлена: ${fullCommand}`);
        return true;
    } catch (err) {
        console.error('❌ Ошибка отправки команды:', err.message);
        return null;
    }
}

// ========================================
//  API ЭНДПОИНТЫ
// ========================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        cache: cache.getStats(),
        uptime: process.uptime()
    });
});

// Авторизация
app.post('/api/auth/login', async (req, res) => {
    try {
        const { login, password } = req.body;
        
        if (!login || !password) {
            return res.status(400).json({ error: 'Логин и пароль обязательны' });
        }

        // Отправляем команду логина в Discord
        await sendDiscordCommand('login', [login, password]);

        // Временно пропускаем любого
        const token = jwt.sign(
            { login: login, role: 'admin' },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        return res.json({
            success: true,
            token,
            message: '✅ Вход выполнен'
        });
        
    } catch (err) {
        console.error('Ошибка входа:', err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Проверка токена
app.post('/api/auth/verify', (req, res) => {
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

// ========================================
//  ПОЛУЧЕНИЕ ДАННЫХ (С РЕАЛЬНЫМИ ЗАПРОСАМИ)
// ========================================

app.get('/api/:type', async (req, res) => {
    const { type } = req.params;
    const valid = ['machines', 'tasks', 'salary', 'stats'];
    
    if (!valid.includes(type)) {
        return res.status(404).json({ error: 'Неизвестный тип данных' });
    }

    // Проверяем кэш
    const cached = cache.get(type);
    if (cached) {
        return res.json({ success: true, data: cached, cached: true });
    }

    // Отправляем запрос в Discord
    const sent = await sendDiscordCommand(type);
    
    // Пока используем заглушку (в будущем — парсим ответ из Discord)
    const data = getMockData(type);
    cache.set(type, data);
    
    res.json({ 
        success: true, 
        data, 
        cached: false,
        discord: sent ? '✅ команда отправлена' : '❌ Webhook не настроен'
    });
});

// ========================================
//  КОМАНДЫ (действия)
// ========================================

app.post('/api/command/:action', async (req, res) => {
    try {
        const { action } = req.params;
        const args = req.body.args || [];

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Не авторизован' });
        }

        const token = authHeader.split(' ')[1];
        try {
            jwt.verify(token, JWT_SECRET);
        } catch (err) {
            return res.status(401).json({ error: 'Недействительный токен' });
        }

        // Отправляем команду в Discord
        const sent = await sendDiscordCommand(action, args);

        // Инвалидируем кэш
        cache.del(['machines', 'tasks', 'salary', 'stats']);

        res.json({ 
            success: true, 
            message: `Команда /${action} выполнена`,
            discord: sent ? '✅ отправлено' : '❌ Webhook не настроен',
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        console.error('Ошибка команды:', err);
        res.status(500).json({ error: 'Внутренняя ошибка' });
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
//  404
// ========================================

app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// ========================================
//  ЗАПУСК
// ========================================

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('\n=================================');
    console.log('🚀 Dika Knit Mobile v1.0');
    console.log('=================================');
    console.log(`📍 URL: http://localhost:${PORT}`);
    console.log(`🔐 JWT Secret: ${JWT_SECRET.substring(0, 10)}...`);
    console.log(`📡 Webhook: ${WEBHOOK_URL ? '✅' : '❌'}`);
    console.log('=================================');
    console.log('✅ Сервер готов к работе!\n');
});

process.on('SIGTERM', () => {
    console.log('🛑 Получен SIGTERM, завершаем работу...');
    setTimeout(() => {
        server.close(() => {
            console.log('✅ Сервер остановлен');
            process.exit(0);
        });
    }, 3000);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

module.exports = app;
