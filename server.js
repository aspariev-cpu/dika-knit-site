require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const NodeCache = require('node-cache');
const path = require('path');

// ========================================
//  СОЗДАЁМ APP СРАЗУ
// ========================================

const app = express();

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dika-mobile-secret-2024';
const MOBILE_SECRET_KEY = process.env.MOBILE_SECRET_KEY || 'DikaKnitMobile2024SecureKey';
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const NOTIFICATIONS_CHANNEL = process.env.MOBILE_NOTIFICATIONS_CHANNEL;
const BOT_TOKEN = process.env.MOBILE_BRIDGE_TOKEN;

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
    keyGenerator: (req) => req.ip || req.connection?.remoteAddress || 'unknown'
});

// ========================================
//  MIDDLEWARE
// ========================================

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', limiter);

// ========================================
//  КЭШ
// ========================================

const cache = new NodeCache({ stdTTL: 60, checkperiod: 10 });

// ========================================
//  МОК-ДАННЫЕ (запасной вариант)
// ========================================

function getMockData(type) {
    const data = {
        machines: {
            machines: Array.from({ length: 15 }, (_, i) => ({
                id: i + 1,
                number: i + 1,
                isRunning: false,
                hasHelper: false,
                workedMinutes: 0
            })),
            activeCount: 0
        },
        tasks: {
            inProgress: [],
            pending: [],
            completed: []
        },
        salary: { shift: 0, twoWeeks: 0, month: 0, year: 0 },
        stats: { totalToday: 0, activeTasks: 0, activeMachines: 0, totalMachines: 15, urgentTasks: 0 },
        worker: {
            inProgressShapki: [],
            inProgressCoat: [],
            pendingShapki: [],
            pendingCoat: []
        },
        admin: {
            tasks: []
        }
    };
    return data[type] || {};
}

// ========================================
//  ОТПРАВКА КОМАНД В DISCORD
// ========================================

async function sendDiscordCommand(command, args = []) {
    if (!WEBHOOK_URL) {
        console.warn('⚠️ Webhook не настроен');
        return false;
    }

    try {
        const fullCommand = `/${command} ${args.join(' ')} ${MOBILE_SECRET_KEY}`.trim();
        await axios.post(WEBHOOK_URL, { content: fullCommand });
        console.log(`✅ Команда отправлена: ${fullCommand}`);
        return true;
    } catch (err) {
        console.error('❌ Ошибка отправки:', err.message);
        return false;
    }
}

// ========================================
//  ЧТЕНИЕ ОТВЕТА ИЗ DISCORD
// ========================================

async function readDiscordResponse() {
    if (!NOTIFICATIONS_CHANNEL || !BOT_TOKEN) {
        console.warn('⚠️ Нет настроек для чтения Discord');
        return null;
    }

    try {
        const response = await axios.get(
            `https://discord.com/api/v10/channels/${NOTIFICATIONS_CHANNEL}/messages?limit=5`,
            {
                headers: { 'Authorization': `Bot ${BOT_TOKEN}` }
            }
        );

        const messages = response.data || [];
        const botMessages = messages.filter(m => m.author.bot);
        
        if (botMessages.length === 0) return null;
        return botMessages[0].content;
    } catch (err) {
        console.error('❌ Ошибка чтения Discord:', err.message);
        return null;
    }
}

// ========================================
//  API ЭНДПОИНТЫ
// ========================================

// === Health check ===
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// === Авторизация ===
app.post('/api/auth/login', async (req, res) => {
    try {
        const { login, password } = req.body;
        
        if (!login || !password) {
            return res.status(400).json({ error: 'Логин и пароль обязательны' });
        }

        await sendDiscordCommand('login', [login, password]);

        const token = jwt.sign(
            { login: login, role: login === 'admin' ? 'admin' : 'worker' },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        return res.json({ success: true, token, message: '✅ Вход выполнен' });
    } catch (err) {
        console.error('Ошибка входа:', err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

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

// === Данные для вязальщика ===
app.get('/api/worker/data', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'Не авторизован' });
        }
        jwt.verify(token, JWT_SECRET);

        const cached = cache.get('workerData');
        if (cached) {
            return res.json({ success: true, data: cached, cached: true });
        }

        await sendDiscordCommand('worker_data');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const discordResponse = await readDiscordResponse();
        let data = getMockData('worker');
        
        if (discordResponse) {
            // Парсинг ответа (пока заглушка)
            data = getMockData('worker');
        }
        
        cache.set('workerData', data);
        res.json({ success: true, data, cached: false });
    } catch (err) {
        console.error('Worker data error:', err);
        res.status(500).json({ error: err.message });
    }
});

// === Данные для админа ===
app.get('/api/admin/data', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'Не авторизован' });
        }
        jwt.verify(token, JWT_SECRET);

        const cached = cache.get('adminData');
        if (cached) {
            return res.json({ success: true, data: cached, cached: true });
        }

        await sendDiscordCommand('admin_data');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const discordResponse = await readDiscordResponse();
        let data = getMockData('admin');
        
        if (discordResponse) {
            data = getMockData('admin');
        }
        
        cache.set('adminData', data);
        res.json({ success: true, data, cached: false });
    } catch (err) {
        console.error('Admin data error:', err);
        res.status(500).json({ error: err.message });
    }
});

// === Общие данные (дашборд) ===
app.get('/api/stats', async (req, res) => {
    try {
        const cached = cache.get('stats');
        if (cached) {
            return res.json({ success: true, data: cached, cached: true });
        }

        await sendDiscordCommand('stats');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const discordResponse = await readDiscordResponse();
        let data = getMockData('stats');
        
        if (discordResponse) {
            data = getMockData('stats');
        }
        
        cache.set('stats', data);
        res.json({ success: true, data, cached: false });
    } catch (err) {
        console.error('Stats error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/tasks', async (req, res) => {
    try {
        const cached = cache.get('tasks');
        if (cached) {
            return res.json({ success: true, data: cached, cached: true });
        }

        await sendDiscordCommand('tasks');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const discordResponse = await readDiscordResponse();
        let data = getMockData('tasks');
        
        if (discordResponse) {
            data = getMockData('tasks');
        }
        
        cache.set('tasks', data);
        res.json({ success: true, data, cached: false });
    } catch (err) {
        console.error('Tasks error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/machines', async (req, res) => {
    try {
        const cached = cache.get('machines');
        if (cached) {
            return res.json({ success: true, data: cached, cached: true });
        }

        await sendDiscordCommand('machines');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const discordResponse = await readDiscordResponse();
        let data = getMockData('machines');
        
        if (discordResponse) {
            data = getMockData('machines');
        }
        
        cache.set('machines', data);
        res.json({ success: true, data, cached: false });
    } catch (err) {
        console.error('Machines error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/salary/current', async (req, res) => {
    try {
        const cached = cache.get('salary');
        if (cached) {
            return res.json({ success: true, data: cached, cached: true });
        }

        await sendDiscordCommand('salary');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const discordResponse = await readDiscordResponse();
        let data = getMockData('salary');
        
        if (discordResponse) {
            data = getMockData('salary');
        }
        
        cache.set('salary', data);
        res.json({ success: true, data, cached: false });
    } catch (err) {
        console.error('Salary error:', err);
        res.status(500).json({ error: err.message });
    }
});

// === Команды (действия) ===
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

        const sent = await sendDiscordCommand(action, args);

        // Инвалидируем кэш
        cache.del(['machines', 'tasks', 'salary', 'stats', 'workerData', 'adminData']);

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

// === Прокси для других API запросов (модели, цвета, сотрудники) ===
app.post('/api/:resource', async (req, res) => {
    try {
        const { resource } = req.params;
        const data = req.body;

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Не авторизован' });
        }

        const token = authHeader.split(' ')[1];
        jwt.verify(token, JWT_SECRET);

        // Отправляем команду в Discord
        const command = `${resource}_create`;
        const args = Object.values(data).map(String);
        const sent = await sendDiscordCommand(command, args);

        res.json({ 
            success: true, 
            message: `${resource} создан`,
            discord: sent ? '✅ отправлено' : '❌ Webhook не настроен'
        });
    } catch (err) {
        console.error('Error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/:resource', async (req, res) => {
    try {
        const { resource } = req.params;
        const validResources = ['models', 'colors', 'workers'];
        
        if (!validResources.includes(resource)) {
            return res.status(404).json({ error: 'Неизвестный ресурс' });
        }

        const cached = cache.get(resource);
        if (cached) {
            return res.json({ success: true, data: cached, cached: true });
        }

        await sendDiscordCommand(resource);
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const discordResponse = await readDiscordResponse();
        let data = [];
        
        if (discordResponse) {
            // Парсинг (пока заглушка)
            data = [];
        }
        
        cache.set(resource, data);
        res.json({ success: true, data, cached: false });
    } catch (err) {
        console.error('Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// === ФРОНТЕНД ===
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

app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// === 404 ===
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
    console.log(`📡 Канал уведомлений: ${NOTIFICATIONS_CHANNEL ? '✅' : '❌'}`);
    console.log(`📡 Токен бота: ${BOT_TOKEN ? '✅' : '❌'}`);
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

module.exports = app;
