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
        stats: { totalToday: 0, activeTasks: 0, activeMachines: 0, totalMachines: 15, urgentTasks: 0 }
    };
    return data[type] || {};
}

// ========================================
//  ПАРСИНГ ОТВЕТА ИЗ DISCORD
// ========================================

function parseMachinesResponse(content) {
    const machines = [];
    const lines = content.split('\n');
    let activeCount = 0;

    for (const line of lines) {
        // Ищем строки вида: "🟢 Станок №1 — Работает ⏱️ 3ч 15м | 👤 ✅ Срез."
        const match = line.match(/Станок №(\d+)\s*[—\-]\s*(Работает|Простаивает)/);
        if (match) {
            const number = parseInt(match[1]);
            const isRunning = match[2] === 'Работает';
            
            // Ищем время
            const timeMatch = line.match(/⏱️\s*(\d+)ч\s*(\d+)м/);
            const workedMinutes = timeMatch ? parseInt(timeMatch[1]) * 60 + parseInt(timeMatch[2]) : 0;
            
            // Ищем срезальщицу
            const hasHelper = line.includes('✅ Срез.');
            
            machines.push({ id: number, number, isRunning, hasHelper, workedMinutes });
            if (isRunning) activeCount++;
        }
    }

    // Если не удалось распарсить — возвращаем пустой массив
    if (machines.length === 0) {
        return getMockData('machines');
    }

    return { machines, activeCount };
}

function parseTasksResponse(content) {
    // TODO: парсинг заданий из Discord
    return getMockData('tasks');
}

function parseSalaryResponse(content) {
    // TODO: парсинг зарплаты из Discord
    return getMockData('salary');
}

function parseStatsResponse(content) {
    // TODO: парсинг статистики из Discord
    return getMockData('stats');
}

function parseDiscordResponse(content, type) {
    switch (type) {
        case 'machines': return parseMachinesResponse(content);
        case 'tasks': return parseTasksResponse(content);
        case 'salary': return parseSalaryResponse(content);
        case 'stats': return parseStatsResponse(content);
        default: return getMockData(type);
    }
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

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
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
        
        return res.json({ success: true, token, message: '✅ Вход выполнен' });
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
//  ПОЛУЧЕНИЕ ДАННЫХ
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

    // Отправляем команду в Discord
    const sent = await sendDiscordCommand(type);
    
    // Ждём ответ (3 секунды)
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Читаем ответ из Discord
    const discordResponse = await readDiscordResponse();
    
    let data;
    if (discordResponse) {
        console.log(`📦 Получен ответ для /${type}: ${discordResponse.substring(0, 100)}...`);
        data = parseDiscordResponse(discordResponse, type);
    } else {
        // Если нет ответа — используем заглушку
        data = getMockData(type);
    }
    
    // Сохраняем в кэш
    cache.set(type, data);
    
    res.json({ 
        success: true, 
        data, 
        cached: false,
        source: discordResponse ? 'Discord' : 'Mock',
        timestamp: new Date().toISOString()
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
