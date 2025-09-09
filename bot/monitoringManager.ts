// FIX: Declare '__dirname' to resolve TypeScript error about missing Node.js type definitions.
declare const __dirname: string;

import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';
import { Movie } from './types';
import { atomicWrite, setUserState, getUserState, clearUserState } from './utils';
import { GoogleGenAI, Type } from "@google/genai";

const CONFIG_PATH = path.join(__dirname, './monitoringConfig.json');
const MOVIES_PATH = path.join(__dirname, '../../data/movies.json');

const apiKey = "AIzaSyB12BsvYrfH536bmxTj7Rdj3fY_ScjKecQ";
const ai = new GoogleGenAI({ apiKey });
const model = 'gemini-2.5-flash';

interface MonitoringConfig {
    enabled: boolean;
    checkIntervalMinutes: number;
    autoUploadChannels: string[];
    notificationChannels: string[];
}

export const getMonitoringConfig = (): MonitoringConfig => {
    try {
        if (!fs.existsSync(CONFIG_PATH)) {
            const defaultConfig: MonitoringConfig = {
                enabled: false,
                checkIntervalMinutes: 60,
                autoUploadChannels: [],
                notificationChannels: [],
            };
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2));
            return defaultConfig;
        }
        const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
        return JSON.parse(data);
    } catch {
        return { enabled: false, checkIntervalMinutes: 60, autoUploadChannels: [], notificationChannels: [] };
    }
};

const writeConfig = (config: MonitoringConfig) => atomicWrite(CONFIG_PATH, JSON.stringify(config, null, 2));

const readMovies = (): Movie[] => {
    try {
        if (!fs.existsSync(MOVIES_PATH)) return [];
        return JSON.parse(fs.readFileSync(MOVIES_PATH, 'utf-8'));
    } catch { return []; }
};
const writeMovies = (movies: Movie[]) => atomicWrite(MOVIES_PATH, JSON.stringify(movies, null, 2));

// --- SIMULATION ---
// This function simulates checking YouTube and finding a new movie.
// It now also determines if the video is a full movie or a trailer.
const simulateCheck = (): { channel: string, videoTitle: string, videoUrl: string, type: 'full-movie' | 'trailer' } | null => {
    const config = getMonitoringConfig();
    const allChannels = [...config.autoUploadChannels, ...config.notificationChannels];
    if (allChannels.length === 0 || Math.random() > 0.4) { // 40% chance of finding something
        return null;
    }

    const channel = allChannels[Math.floor(Math.random() * allChannels.length)];
    const isTrailer = Math.random() > 0.5; // 50% chance of it being a trailer
    const videoType = isTrailer ? 'trailer' : 'full-movie';
    const titlePrefix = isTrailer ? 'Official Trailer' : 'Full Movie:';
    
    return {
        channel,
        videoTitle: `${titlePrefix} Elesin Oba ${Math.floor(Math.random() * 100)} - New Yoruba Movie 2024`,
        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', // Example URL
        type: videoType
    };
};

export const checkMonitoredChannels = async (bot: TelegramBot) => {
    const config = getMonitoringConfig();
    if (!config.enabled) return;

    const newVideo = simulateCheck();
    if (!newVideo) {
        console.log("Monitoring: No new videos found in simulation.");
        return;
    }
    
    const adminId = process.env.ADMIN_TELEGRAM_USER_ID;
    if (!adminId) return;

    // Check if it's a notification-only channel. These channels notify for ANY video type.
    if (config.notificationChannels.includes(newVideo.channel)) {
        console.log(`Monitoring: Found new video on NOTIFICATION channel "${newVideo.channel}". Notifying admin.`);
        bot.sendMessage(adminId, `🔔 *New Movie Notification*\n\nChannel: *${newVideo.channel}*\nTitle: *${newVideo.videoTitle}*\nLink: ${newVideo.videoUrl}`, { parse_mode: 'Markdown' });
        return;
    }

    // Process for auto-upload channels, which have different logic for full movies vs trailers.
    if (config.autoUploadChannels.includes(newVideo.channel)) {
        // If it's a trailer on an auto-upload channel, just notify the admin and stop.
        if (newVideo.type === 'trailer') {
            console.log(`Monitoring: Found TRAILER on AUTO-UPLOAD channel "${newVideo.channel}". Notifying admin, but not uploading.`);
             bot.sendMessage(adminId, `🎬 *New Trailer Found*\n\nA trailer was detected on the auto-upload channel *${newVideo.channel}* and was NOT added to the site.\n\nTitle: *${newVideo.videoTitle}*`, { parse_mode: 'Markdown' });
            return;
        }

        // If it's a full movie, proceed with AI processing and upload.
        console.log(`Monitoring: Found FULL MOVIE on AUTO-UPLOAD channel "${newVideo.channel}". Processing...`);
        bot.sendMessage(adminId, `⏳ Found new full movie on *${newVideo.channel}*: "${newVideo.videoTitle}".\nAttempting to auto-add to site...`, { parse_mode: 'Markdown' });
        
        try {
            const systemInstruction = `You are a data extraction tool. Analyze the provided title of a new FULL MOVIE and create a JSON object with its details. The 'category' should be one of: Drama, Comedy, Action, Romance, Thriller, Epic. The 'releaseDate' should be today's date in YYYY-MM-DD format.`;
            const responseSchema = {
                type: Type.OBJECT, properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    stars: { type: Type.ARRAY, items: { type: Type.STRING } },
                    genre: { type: Type.STRING },
                    category: { type: Type.STRING },
                    releaseDate: { type: Type.STRING },
                }
            };
            const response = await ai.models.generateContent({
                model, contents: `Extract details from: ${newVideo.videoTitle}`,
                config: { systemInstruction, responseMimeType: "application/json", responseSchema }
            });

            const details = JSON.parse(response.text);
            const movies = readMovies();

            // Double check to prevent adding duplicates if title already exists
            if (movies.some(m => m.title.toLowerCase() === details.title.toLowerCase())) {
                console.log(`Monitoring: Movie "${details.title}" already exists. Skipping.`);
                bot.sendMessage(adminId, `⚠️ *Duplicate Movie*\n\nAI processed "${newVideo.videoTitle}" but a movie named "${details.title}" already exists. No action was taken.`);
                return;
            }

            const newMovie: Movie = {
                id: details.title.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30),
                ...details,
                poster: "https://picsum.photos/seed/autoupload/300/400", // Placeholder
                downloadLink: newVideo.videoUrl,
                runtime: "N/A",
                rating: 7.0,
                popularity: 75,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            writeMovies([...movies, newMovie]);
            bot.sendMessage(adminId, `✅ *Auto-Added Movie*\n\n"${newMovie.title}" has been successfully added to the site from YouTube channel *${newVideo.channel}*.`, { parse_mode: 'Markdown' });

        } catch (e) {
            console.error("Auto-upload failed:", e);
            bot.sendMessage(adminId, `❌ *Auto-Add Failed*\n\nCould not process movie "${newVideo.videoTitle}". Please add it manually.`);
        }
    }
};


// --- UI and State Management ---
export const showMonitoringMenu = (bot: TelegramBot, chatId: number, messageId: number) => {
    const config = getMonitoringConfig();
    const status = config.enabled ? '🟢 ON' : '🔴 OFF';
    const text = `*🔭 YouTube Monitoring Settings*\n\n` +
                 `*Status:* ${status}\n` +
                 `*Check Interval:* ${config.checkIntervalMinutes} minutes\n` +
                 `*Auto-Upload Channels:* ${config.autoUploadChannels.length}\n` +
                 `*Notification Channels:* ${config.notificationChannels.length}`;
    
    bot.editMessageText(text, {
        chat_id: chatId, message_id: messageId, parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: `Toggle ${config.enabled ? 'OFF' : 'ON'}`, callback_data: 'monitoring_toggle' }],
                [{ text: "⏰ Set Interval", callback_data: "monitoring_set_interval" }],
                [{ text: "📤 Manage Auto-Upload List", callback_data: "monitoring_edit_upload" }],
                [{ text: "🔔 Manage Notification List", callback_data: "monitoring_edit_notify" }],
                [{ text: "⬅️ Back", callback_data: "main_menu" }]
            ]
        }
    });
};

export const handleMonitoringCallback = (bot: TelegramBot, query: TelegramBot.CallbackQuery, refreshMonitoring?: () => void) => {
    const msg = query.message!;
    const data = query.data!;
    const config = getMonitoringConfig();

    if (data === 'monitoring_toggle') {
        config.enabled = !config.enabled;
        writeConfig(config);
        if (refreshMonitoring) refreshMonitoring();
    } else if (data === 'monitoring_set_interval') {
        setUserState(msg.from!.id, { command: 'monitoring_update_interval' });
        bot.sendMessage(msg.chat.id, "Enter the new check interval in minutes (e.g., 30):");
    } else if (data === 'monitoring_edit_upload') {
        setUserState(msg.from!.id, { command: 'monitoring_update_upload_list' });
        bot.sendMessage(msg.chat.id, "Send the full list of auto-upload YouTube channel URLs, one per line.");
    } else if (data === 'monitoring_edit_notify') {
        setUserState(msg.from!.id, { command: 'monitoring_update_notify_list' });
        bot.sendMessage(msg.chat.id, "Send the full list of notification-only YouTube channel URLs, one per line.");
    }
    
    showMonitoringMenu(bot, msg.chat.id, msg.message_id);
    bot.answerCallbackQuery(query.id);
};

export const handleMonitoringUpdateResponse = (bot: TelegramBot, msg: TelegramBot.Message) => {
    const userId = msg.from!.id;
    const text = msg.text!;
    const state = getUserState(userId);
    const config = getMonitoringConfig();

    if (state?.command === 'monitoring_update_interval') {
        const interval = parseInt(text, 10);
        if (!isNaN(interval) && interval > 0) {
            config.checkIntervalMinutes = interval;
            bot.sendMessage(userId, `✅ Interval set to ${interval} minutes.`);
        } else {
            bot.sendMessage(userId, `❌ Invalid number.`);
        }
    } else if (state?.command === 'monitoring_update_upload_list') {
        config.autoUploadChannels = text.split('\n').map(line => line.trim()).filter(Boolean);
        bot.sendMessage(userId, `✅ Auto-upload list updated with ${config.autoUploadChannels.length} channels.`);
    } else if (state?.command === 'monitoring_update_notify_list') {
        config.notificationChannels = text.split('\n').map(line => line.trim()).filter(Boolean);
        bot.sendMessage(userId, `✅ Notification list updated with ${config.notificationChannels.length} channels.`);
    }

    writeConfig(config);
    clearUserState(userId);
};
