// FIX: Declare '__dirname' to resolve TypeScript error about missing Node.js type definitions.
declare const __dirname: string;

import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';
import { Movie } from './types';
import { atomicWrite, setUserState, getUserState, clearUserState } from './utils';
import { findNewTrendingMovie } from './aiHandler';
import { createMovieFromYouTube } from './movieManager';


const CONFIG_PATH = path.join(__dirname, './monitoringConfig.json');
const MOVIES_PATH = path.join(__dirname, '../../data/movies.json');

interface AutomationConfig {
    autonomousFinder: {
        enabled: boolean;
        checkIntervalMinutes: number;
    };
    channelMonitor: {
        enabled: boolean;
        checkIntervalMinutes: number;
        autoUploadChannels: string[];
        notificationChannels: string[];
    };
}

const defaultConfig: AutomationConfig = {
    autonomousFinder: { enabled: true, checkIntervalMinutes: 2 },
    channelMonitor: { enabled: false, checkIntervalMinutes: 60, autoUploadChannels: [], notificationChannels: [] }
};

export const getAutomationConfig = (): AutomationConfig => {
    try {
        if (!fs.existsSync(CONFIG_PATH)) {
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2));
            return defaultConfig;
        }
        const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
        // Merge with default to handle missing keys from older configs
        const savedConfig = JSON.parse(data);
        return { ...defaultConfig, ...savedConfig };
    } catch {
        return defaultConfig;
    }
};

const writeConfig = (config: AutomationConfig) => atomicWrite(CONFIG_PATH, JSON.stringify(config, null, 2));

const readMovies = (): Movie[] => {
    try {
        if (!fs.existsSync(MOVIES_PATH)) return [];
        return JSON.parse(fs.readFileSync(MOVIES_PATH, 'utf-8'));
    } catch { return []; }
};
const writeMovies = (movies: Movie[]) => atomicWrite(MOVIES_PATH, JSON.stringify(movies, null, 2));


// --- AUTONOMOUS MOVIE FINDER (NEW FEATURE) ---
export const runAutonomousFinder = async (bot: TelegramBot) => {
    const config = getAutomationConfig();
    if (!config.autonomousFinder.enabled) return;
    
    const adminId = process.env.ADMIN_TELEGRAM_USER_ID;
    if (!adminId) return;

    try {
        console.log("Autonomous Finder: Starting search...");
        const movies = readMovies();
        const existingTitles = movies.map(m => m.title);

        const newVideoUrl = await findNewTrendingMovie(existingTitles);

        if (!newVideoUrl) {
            console.log("Autonomous Finder: No new trending movies found that met the criteria.");
            return;
        }

        console.log(`Autonomous Finder: Found new candidate: ${newVideoUrl}`);
        bot.sendMessage(adminId, `🤖 Found a new trending movie:\n${newVideoUrl}\n\n⏳ Processing with AI to extract details and find a poster...`, { disable_web_page_preview: true });

        const newMovie = await createMovieFromYouTube(newVideoUrl);

        if (!newMovie) {
            bot.sendMessage(adminId, `❌ AI processing failed for the movie above. This is likely because a valid poster could not be automatically downloaded. Please try adding it manually if desired.`);
            return;
        }

        const currentMovies = readMovies();
        if (currentMovies.some(m => m.title.toLowerCase() === newMovie.title.toLowerCase())) {
            bot.sendMessage(adminId, `⚠️ AI processed a new movie, but a movie named "${newMovie.title}" already exists. Upload aborted.`);
            return;
        }

        writeMovies([...currentMovies, newMovie]);
        bot.sendMessage(adminId, `✅ *Success!* The AI has automatically added a new movie:\n\n*Title:* ${newMovie.title}\n*Category:* ${newMovie.category}\n*Stars:* ${newMovie.stars.join(', ')}\n\nIt is now live on the website!`, { parse_mode: 'Markdown'});

    } catch (error) {
        console.error("Autonomous Finder encountered an error:", error);
        bot.sendMessage(adminId, "🚨 The autonomous movie finder encountered an unexpected error. Please check the logs.");
    }
};


// --- CHANNEL-SPECIFIC MONITOR (OLD FEATURE) ---
const simulateCheck = (): { channel: string, videoTitle: string, videoUrl: string } | null => {
    const config = getAutomationConfig().channelMonitor;
    const allChannels = [...config.autoUploadChannels, ...config.notificationChannels];
    if (allChannels.length === 0 || Math.random() > 0.4) {
        return null;
    }
    const channel = allChannels[Math.floor(Math.random() * allChannels.length)];
    return {
        channel,
        videoTitle: `Full Movie: Elesin Oba ${Math.floor(Math.random() * 100)} - New Yoruba Movie 2024`,
        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    };
};

export const checkChannelSpecificMonitor = async (bot: TelegramBot) => {
    const config = getAutomationConfig().channelMonitor;
    if (!config.enabled) return;
    
    const newVideo = simulateCheck();
    if (!newVideo) {
        console.log("Channel Monitor: No new videos found in simulation.");
        return;
    }
    
    const adminId = process.env.ADMIN_TELEGRAM_USER_ID;
    if (!adminId) return;

    bot.sendMessage(adminId, `🔔 *Channel Monitor Alert*\n\n(This is a simulated notification from the old system)\n\nChannel: *${newVideo.channel}*\nTitle: *${newVideo.videoTitle}*`, { parse_mode: 'Markdown' });
};


// --- UI and State Management ---
export const showAutomationMenu = (bot: TelegramBot, chatId: number, messageId: number) => {
    const config = getAutomationConfig();
    const finderStatus = config.autonomousFinder.enabled ? '🟢 ON' : '🔴 OFF';
    const monitorStatus = config.channelMonitor.enabled ? '🟢 ON' : '🔴 OFF';

    const text = `*🤖 Automation Settings*\n\n` +
                 `*Autonomous Movie Finder:*\n` +
                 `  - Status: *${finderStatus}*\n` +
                 `  - Interval: *${config.autonomousFinder.checkIntervalMinutes} minutes*\n\n` +
                 `*Channel-Specific Monitor:*\n` +
                 `  - Status: *${monitorStatus}*\n` +
                 `  - Interval: *${config.channelMonitor.checkIntervalMinutes} minutes*\n`;
    
    bot.editMessageText(text, {
        chat_id: chatId, message_id: messageId, parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: "▶️ Trigger Autonomous Search Now", callback_data: 'automation_finder_run' }],
                [{ text: `Toggle Finder ${config.autonomousFinder.enabled ? 'OFF' : 'ON'}`, callback_data: 'automation_finder_toggle' }, { text: "⏰ Set Finder Interval", callback_data: 'automation_finder_interval' }],
                [{ text: `Toggle Monitor ${config.channelMonitor.enabled ? 'OFF' : 'ON'}`, callback_data: 'automation_monitor_toggle' }, { text: "⏰ Set Monitor Interval", callback_data: 'automation_monitor_interval' }],
                [{ text: "⬅️ Back", callback_data: "main_menu" }]
            ]
        }
    });
};

export const handleAutomationCallback = (bot: TelegramBot, query: TelegramBot.CallbackQuery, refreshAutomation?: () => void) => {
    const msg = query.message!;
    const data = query.data!;
    const config = getAutomationConfig();

    if (data === 'automation_finder_run') {
        bot.answerCallbackQuery(query.id, { text: "Starting autonomous search..." });
        runAutonomousFinder(bot); // Manually trigger
        return; // Don't redraw menu
    }
    else if (data === 'automation_finder_toggle') {
        config.autonomousFinder.enabled = !config.autonomousFinder.enabled;
    } else if (data === 'automation_finder_interval') {
        setUserState(msg.from!.id, { command: 'automation_update_finder_interval' });
        bot.sendMessage(msg.chat.id, "Enter the new search interval in minutes for the Autonomous Finder (e.g., 2):");
    } else if (data === 'automation_monitor_toggle') {
        config.channelMonitor.enabled = !config.channelMonitor.enabled;
    } else if (data === 'automation_monitor_interval') {
        setUserState(msg.from!.id, { command: 'automation_update_monitor_interval' });
        bot.sendMessage(msg.chat.id, "Enter new check interval in minutes for the Channel Monitor (e.g., 60):");
    }
    
    writeConfig(config);
    if (refreshAutomation) refreshAutomation();

    showAutomationMenu(bot, msg.chat.id, msg.message_id);
    bot.answerCallbackQuery(query.id);
};

export const handleAutomationUpdateResponse = (bot: TelegramBot, msg: TelegramBot.Message) => {
    const userId = msg.from!.id;
    const text = msg.text!;
    const state = getUserState(userId);
    const config = getAutomationConfig();
    let changed = false;

    const interval = parseInt(text, 10);
    if (isNaN(interval) || interval <= 0) {
        bot.sendMessage(userId, `❌ Invalid number.`);
        clearUserState(userId);
        return;
    }

    if (state?.command === 'automation_update_finder_interval') {
        config.autonomousFinder.checkIntervalMinutes = interval;
        bot.sendMessage(userId, `✅ Autonomous Finder interval set to ${interval} minutes.`);
        changed = true;
    } else if (state?.command === 'automation_update_monitor_interval') {
        config.channelMonitor.checkIntervalMinutes = interval;
        bot.sendMessage(userId, `✅ Channel Monitor interval set to ${interval} minutes.`);
        changed = true;
    }

    if (changed) {
        writeConfig(config);
    }
    clearUserState(userId);
};