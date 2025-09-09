// FIX: Declare 'process' to resolve TypeScript error about missing Node.js type definitions.
declare const process: any;

import TelegramBot from 'node-telegram-bot-api';
import { handleStartCommand, handleCallbackQuery, handleMessage } from './commands';
import { clearAllUserStates } from './utils';
import { getWeeklyDigest } from './aiHandler';
import { getAutomationConfig, checkChannelSpecificMonitor, runAutonomousFinder } from './monitoringManager';

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


// 2. Automation Tasks (Channel Monitor & Autonomous Finder)
// FIX: Changed NodeJS.Timeout to 'any' to resolve TypeScript error about missing Node.js type definitions.
let channelMonitorInterval: any | null = null;
let autonomousFinderInterval: any | null = null;

const setupAutomationIntervals = () => {
    // Clear existing intervals to allow for config reloads
    if (channelMonitorInterval) clearInterval(channelMonitorInterval);
    if (autonomousFinderInterval) clearInterval(autonomousFinderInterval);

    const config = getAutomationConfig();

    // Setup Channel-Specific Monitor (the old system)
    if (config.channelMonitor.enabled && config.channelMonitor.checkIntervalMinutes > 0) {
        const intervalMs = config.channelMonitor.checkIntervalMinutes * 60 * 1000;
        channelMonitorInterval = setInterval(() => {
            console.log("Running scheduled task: Channel-Specific Monitoring...");
            checkChannelSpecificMonitor(bot);
        }, intervalMs);
        console.log(`Channel-specific monitoring scheduled to run every ${config.channelMonitor.checkIntervalMinutes} minutes.`);
    } else {
        console.log("Channel-specific monitoring is disabled.");
    }

    // Setup Autonomous Movie Finder (the new system)
    if (config.autonomousFinder.enabled && config.autonomousFinder.checkIntervalMinutes > 0) {
        const intervalMs = config.autonomousFinder.checkIntervalMinutes * 60 * 1000;
        autonomousFinderInterval = setInterval(() => {
            console.log("Running scheduled task: Autonomous Movie Finder...");
            runAutonomousFinder(bot);
        }, intervalMs);
        console.log(`Autonomous movie finder scheduled to run every ${config.autonomousFinder.checkIntervalMinutes} minutes.`);
    } else {
        console.log("Autonomous movie finder is disabled.");
    }
};


// Initial setup
setupAutomationIntervals();
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
bot.on('callback_query', withAdminAuthCallback((query) => handleCallbackQuery(bot, query, setupAutomationIntervals)));
bot.on('message', withAdminAuth((msg) => {
    if (msg.text && msg.text.startsWith('/')) return;
    handleMessage(bot, msg);
}));
bot.on('photo', withAdminAuth((msg) => handleMessage(bot, msg)));

console.log("✅ Yoruba Cinemax Admin Bot is running!");

process.on('SIGINT', () => {
    console.log("Bot is shutting down...");
    if (channelMonitorInterval) clearInterval(channelMonitorInterval);
    if (autonomousFinderInterval) clearInterval(autonomousFinderInterval);
    bot.stopPolling().catch(err => console.error("Error stopping polling:", err));
    process.exit();
});
