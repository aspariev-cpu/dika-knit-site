require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const NodeCache = require('node-cache');
const path = require('path');

const app = express();

// ========================================
//  КОНФИГУРАЦИЯ
// ========================================

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dika-mobile-secret-2024';
const MOBILE_SECRET_KEY = process.env.MOBILE_SECRET_KEY || 'DikaKnitMobile2024SecureKey';
const COMMANDS_CHANNEL = process.env.MOBILE_COMMANDS_CHANNEL;
const CACHE_TTL = parseInt(process.env.CACHE_TTL) || 60000;

// ========================================
//  TRUST PROXY (для Render)
// ========================================

// Безопасная настройка для работы за прокси
app.set('trust proxy', 1);

// ========================================
//  RATE LIMITING (с защитой от подделки IP)
// ========================================

const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        // Безопасное получение IP с учётом прокси
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

// Rate limiting только для API
app.use('/api', limiter);

// ========================================
//  КЭШ
// ========================================

const cache = new NodeCache({
    stdTTL: Math.floor(CACHE_TTL / 1000),
    checkperiod: 10,
    useClones: false
});

// ========================================
//  ЛОГГЕР
// ========================================

const logger = {
    info: (msg, data = null) => {
        console.log(`[${new Date().toISOString()}] ℹ️ ${msg}`, data || '');
    },
    error: (msg, data = null) => {
        console.error(`[${new Date().toISOString()}] ❌ ${msg}`, data || '');
    },
    debug: (msg, data = null) => {
        if (process.env.DEBUG === 'true') {
            console.log(`[${new Date().toISOString()}] 🐛 ${msg}`, data || '');
        }
    }
};

// ========================================
//  ОТПРАВКА КОМАНД В DISCORD
// ========================================

async function sendCommand(command, args = []) {
    try {
        const fullCommand = `/${command} ${args.join(' ')} ${MOBILE_SECRET_KEY}`.trim();
        
        // Проверяем наличие Webhook
        const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
        if (!webhookUrl) {
            logger.warn('DISCORD_WEBHOOK_URL не настроен');
            return { success: false, error: 'Webhook не настроен' };
        }

        const response = await axios.post(webhookUrl, {
            content: fullCommand
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });

        if (response.status === 204 || response.status === 200) {
            logger.info(`Команда отправлена: ${fullCommand}`);
            return { success: true };
        }

        return { success: false, error: `HTTP ${response.status}` };
    } catch (err) {
        logger.error('Ошибка отправки команды:', err.message);
        return { success: false, error: err.message };
    }
}

// ========================================
//  API ЭНДПОИНТЫ
// ========================================

// === Проверка здоровья ===
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        cache: cache.getStats(),
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

        // Отправляем команду в Discord
        const result = await sendCommand('login', [login, password]);
        
        if (!result.success) {
            // Если не удалось отправить команду, возвращаем тестовый токен
            // (для разработки, пока Webhook не настроен)
            if (process.env.NODE_ENV === 'development') {
                const token = jwt.sign(
                    { login, role: 'admin' },
                    JWT_SECRET,
                    { expiresIn: '7d' }
                );
                return res.json({
                    success: true,
                    token,
                    message: 'Вход выполнен (тестовый режим)'
                });
            }
            return res.status(500).json({ error: 'Ошибка отправки команды' });
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
        logger.error('Ошибка входа:', err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

app.post('/api/auth/verify', async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) {
            return res.status(401).json({ error: 'Токен не предоставлен' });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        res.json({ 
            success: true, 
            user: {
                login: decoded.login,
                role: decoded.role || 'worker'
            }
        });
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Токен истек' });
        }
        res.status(401).json({ error: 'Недействительный токен' });
    }
});

// === Получение данных ===

// Функция-заглушка для получения данных (пока не настроен Webhook)
function getMockData(type) {
    const mockData = {
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
        salary: {
            shift: 750,
            twoWeeks: 8450,
            month: 16200,
            year: 194400
        },
        stats: {
            totalToday: 145,
            activeTasks: 8,
            activeMachines: 12,
            totalMachines: 15,
            urgentTasks: 2
        }
    };
    return mockData[type] || {};
}

// Универсальный эндпоинт для получения данных
app.get('/api/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const validTypes = ['machines', 'tasks', 'salary', 'stats'];
        
        if (!validTypes.includes(type)) {
            return res.status(404).json({ error: 'Неизвестный тип данных' });
        }

        // Проверяем кэш
        const cached = cache.get(type);
        if (cached) {
            return res.json({ 
                success: true, 
                data: cached, 
                cached: true,
                timestamp: new Date().toISOString()
            });
        }

        // Пытаемся получить данные через Discord
        const result = await sendCommand(type);
        
        // Если команда не отправлена или нет Webhook — используем заглушку
        let data;
        if (!result.success) {
            logger.info(`Используем заглушку для ${type}`);
            data = getMockData(type);
        } else {
            // Здесь будет парсинг ответа из Discord
            // Пока используем заглушку
            data = getMockData(type);
        }

        // Сохраняем в кэш
        cache.set(type, data);

        res.json({ 
            success: true, 
            data, 
            cached: false,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        logger.error(`Ошибка получения ${req.params.type}:`, err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// === Команды (действия) ===
app.post('/api/command/:action', async (req, res) => {
    try {
        const { action } = req.params;
        const args = req.body.args || [];

        // Проверяем авторизацию
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

        // Отправляем команду
        const result = await sendCommand(action, args);
        
        if (!result.success) {
            return res.status(500).json({ error: result.error || 'Ошибка выполнения команды' });
        }

        // Инвалидируем кэш
        const cacheKeys = ['machines', 'tasks', 'salary', 'stats'];
        cache.del(cacheKeys);

        res.json({ 
            success: true, 
            message: 'Команда выполнена',
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        logger.error('Ошибка выполнения команды:', err);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
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
//  ОБРАБОТКА ОШИБОК
// ========================================

// 404
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// Глобальный обработчик ошибок
app.use((err, req, res, next) => {
    logger.error('Необработанная ошибка:', err);
    res.status(500).json({ 
        error: 'Внутренняя ошибка сервера',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
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
    console.log(`🔑 Mobile Secret: ${MOBILE_SECRET_KEY.substring(0, 10)}...`);
    console.log(`💾 Cache TTL: ${CACHE_TTL / 1000} сек`);
    console.log(`📡 Webhook: ${process.env.DISCORD_WEBHOOK_URL ? '✅' : '❌ (не настроен)'}`);
    console.log('=================================');
    console.log('✅ Сервер готов к работе!\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Получен SIGTERM, завершаем работу...');
    server.close(() => {
        console.log('✅ Сервер остановлен');
        process.exit(0);
    });
});

// Обработка непойманных ошибок
process.on('unhandledRejection', (err) => {
    logger.error('Unhandled Rejection:', err);
});

process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
});

// ========================================
//  ЭКСПОРТ (для тестов)
// ========================================

module.exports = app;
