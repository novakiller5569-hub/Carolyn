import TelegramBot from 'node-telegram-bot-api';
import { handleStartCommand, handleCallbackQuery, handleMessage } from './commands';
import { clearAllUserStates } from './utils';
import { getWeeklyDigest } from './aiHandler';
import { checkMonitoredChannels, getMonitoringConfig } from './monitoringManager';

// This file is required by index.ts and assumes environment checks have passed.

const token = process.env.TELEGRAM_BOT_TOKEN!; // The '!' is safe because index.ts checks it.
const adminId = process.env.ADMIN_TELEGRAM_USER_ID;

if (!adminId) {
    console.warn("Warning: ADMIN_TELEGRAM_USER_ID is not defined. The bot will be accessible to anyone.");
}

const bot = new TelegramBot(token, { polling: true });

// Clear any stale user states on startup
clearAllUserStates();

// --- SCHEDULED TASKS ---

// 1. Weekly AI Performance Digest
const scheduleWeeklyDigest = () => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const hour = now.getHours();
    
    // Target: Monday at 9 AM
    let delay = 0;
    const daysUntilMonday = (1 - dayOfWeek + 7) % 7;
    
    if (daysUntilMonday === 0 && hour >= 9) {
        // If it's Monday but past 9 AM, schedule for next week
        delay = 7 * 24 * 60 * 60 * 1000;
    } else {
        const targetDate = new Date();
        targetDate.setDate(now.getDate() + daysUntilMonday);
        targetDate.setHours(9, 0, 0, 0);
        delay = targetDate.getTime() - now.getTime();
    }

    setTimeout(() => {
        console.log("Running scheduled task: Weekly AI Performance Digest...");
        getWeeklyDigest(bot);
        // After the first run, set it to run every 7 days
        setInterval(() => {
            console.log("Running scheduled task: Weekly AI Performance Digest...");
            getWeeklyDigest(bot);
        }, 7 * 24 * 60 * 60 * 1000);
    }, delay);

    console.log(`Weekly AI digest is scheduled. First run in approximately ${Math.round(delay / (1000*60*60))} hours.`);
};


// 2. YouTube Channel Monitoring
let monitoringInterval: NodeJS.Timeout | null = null;

const setupMonitoringInterval = () => {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
    }
    const config = getMonitoringConfig();
    if (config.enabled && config.checkIntervalMinutes > 0) {
        const intervalMs = config.checkIntervalMinutes * 60 * 1000;
        monitoringInterval = setInterval(() => {
            console.log("Running scheduled task: YouTube Channel Monitoring...");
            checkMonitoredChannels(bot);
        }, intervalMs);
        console.log(`YouTube channel monitoring scheduled to run every ${config.checkIntervalMinutes} minutes.`);
    } else {
        console.log("YouTube channel monitoring is disabled or has no interval set.");
    }
};

// Initial setup
setupMonitoringInterval();
scheduleWeeklyDigest();


// --- SECURITY MIDDLEWARE ---
const withAdminAuth = (handler: (msg: TelegramBot.Message) => void) => {
    return (msg: TelegramBot.Message) => {
        if (adminId && msg.from?.id.toString() !== adminId) {
            bot.sendMessage(msg.chat.id, "⛔ Sorry, you are not authorized to use this bot.");
            return;
        }
        handler(msg);
    };
};

const withAdminAuthCallback = (handler: (query: TelegramBot.CallbackQuery) => void) => {
    return (query: TelegramBot.CallbackQuery) => {
        if (adminId && query.from?.id.toString() !== adminId) {
            bot.answerCallbackQuery(query.id, { text: "⛔ You are not authorized." });
            return;
        }
        handler(query);
    };
};


// --- ROUTING ---
bot.onText(/\/start/, withAdminAuth((msg) => handleStartCommand(bot, msg)));
bot.on('callback_query', withAdminAuthCallback((query) => handleCallbackQuery(bot, query, setupMonitoringInterval)));
bot.on('message', withAdminAuth((msg) => {
    if (msg.text && msg.text.startsWith('/')) return;
    handleMessage(bot, msg);
}));
bot.on('photo', withAdminAuth((msg) => handleMessage(bot, msg)));

console.log("✅ Yoruba Cinemax Admin Bot is running!");

process.on('SIGINT', () => {
    console.log("Bot is shutting down...");
    if (monitoringInterval) clearInterval(monitoringInterval);
    bot.stopPolling().catch(err => console.error("Error stopping polling:", err));
    process.exit();
});