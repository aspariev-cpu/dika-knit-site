// ========================================
//  ДАННЫЕ ДЛЯ ВЯЗАЛЬЩИКА
// ========================================

app.get('/api/worker/data', async (req, res) => {
    try {
        // Проверяем токен
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'Не авторизован' });
        }
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Получаем задания из Discord через бота-мост
        const command = `/worker_data ${MOBILE_SECRET_KEY}`;
        await axios.post(WEBHOOK_URL, { content: command });
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Читаем ответ из Discord
        const channelId = process.env.MOBILE_NOTIFICATIONS_CHANNEL;
        const botToken = process.env.MOBILE_BRIDGE_TOKEN;
        let data = getMockWorkerData();
        
        if (channelId && botToken) {
            try {
                const response = await axios.get(
                    `https://discord.com/api/v10/channels/${channelId}/messages?limit=3`,
                    { headers: { 'Authorization': `Bot ${botToken}` } }
                );
                const messages = response.data || [];
                const botMessages = messages.filter(m => m.author.bot);
                if (botMessages.length > 0) {
                    data = parseWorkerData(botMessages[0].content);
                }
            } catch (err) {
                console.error('Ошибка чтения Discord:', err.message);
            }
        }
        
        res.json({ success: true, data });
    } catch (err) {
        console.error('Worker data error:', err);
        res.status(500).json({ error: err.message });
    }
});

function getMockWorkerData() {
    return {
        inProgressShapki: [],
        inProgressCoat: [],
        pendingShapki: [],
        pendingCoat: []
    };
}

function parseWorkerData(content) {
    // TODO: парсинг ответа из Discord
    return getMockWorkerData();
}

// ========================================
//  ДАННЫЕ ДЛЯ АДМИНА
// ========================================

app.get('/api/admin/data', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'Не авторизован' });
        }
        const decoded = jwt.verify(token, JWT_SECRET);
        
        const command = `/admin_data ${MOBILE_SECRET_KEY}`;
        await axios.post(WEBHOOK_URL, { content: command });
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const channelId = process.env.MOBILE_NOTIFICATIONS_CHANNEL;
        const botToken = process.env.MOBILE_BRIDGE_TOKEN;
        let data = { tasks: [] };
        
        if (channelId && botToken) {
            try {
                const response = await axios.get(
                    `https://discord.com/api/v10/channels/${channelId}/messages?limit=3`,
                    { headers: { 'Authorization': `Bot ${botToken}` } }
                );
                const messages = response.data || [];
                const botMessages = messages.filter(m => m.author.bot);
                if (botMessages.length > 0) {
                    data = parseAdminData(botMessages[0].content);
                }
            } catch (err) {
                console.error('Ошибка чтения Discord:', err.message);
            }
        }
        
        res.json({ success: true, data });
    } catch (err) {
        console.error('Admin data error:', err);
        res.status(500).json({ error: err.message });
    }
});

function parseAdminData(content) {
    // TODO: парсинг ответа из Discord
    return { tasks: [] };
}