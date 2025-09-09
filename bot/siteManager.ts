// FIX: Declare '__dirname' to resolve TypeScript error about missing Node.js type definitions.
declare const __dirname: string;

import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';
import { SiteConfig, Movie } from './types';
import { setUserState, getUserState, clearUserState, atomicWrite } from './utils';

const CONFIG_PATH = path.join(__dirname, '../../data/siteConfig.json');
const ANNOUNCEMENT_PATH = path.join(__dirname, '../../data/announcement.json');
const MOVIES_PATH = path.join(__dirname, '../../data/movies.json');

const readConfig = (): SiteConfig => {
    try {
        const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Error reading siteConfig.json:", error);
        return { name: "Yoruba Cinemax", tagline: "Nigeria's Premier Yoruba Movie Destination" };
    }
};
const writeConfig = (config: SiteConfig) => atomicWrite(CONFIG_PATH, JSON.stringify(config, null, 2));

const readMovies = (): Movie[] => {
    try {
        const data = fs.readFileSync(MOVIES_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) { return []; }
};

// --- MAIN MENU ---
export const showSiteSettingsMenu = (bot: TelegramBot, chatId: number, messageId: number) => {
    const config = readConfig();
    const featuredMovie = readMovies().find(m => m.id === config.featuredMovieId);

    bot.editMessageText(
        `⚙️ *Site Settings*\n\n` +
        `*Name:* ${config.name}\n` +
        `*Tagline:* ${config.tagline}\n` +
        `*Featured Movie:* ${featuredMovie ? featuredMovie.title : 'None set'}`,
        {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "✏️ Edit Name", callback_data: "sitesettings_edit_name" }, { text: "✏️ Edit Tagline", callback_data: "sitesettings_edit_tagline" }],
                    [{ text: "🌟 Set Featured Movie", callback_data: "sitesettings_set_featured" }, { text: "📢 Broadcast Message", callback_data: "sitesettings_broadcast" }],
                    [{ text: "⬅️ Back to Main Menu", callback_data: "main_menu" }]
                ]
            }
        }
    );
};

// --- CALLBACK HANDLER ---
export const handleSiteSettingsCallback = (bot: TelegramBot, query: TelegramBot.CallbackQuery) => {
    const chatId = query.message?.chat.id;
    const messageId = query.message?.message_id;
    const data = query.data;
    if (!chatId || !data) return;

    const userId = query.from.id;

    if (data === 'sitesettings_edit_name') {
        setUserState(userId, { command: 'sitesettings_update_name' });
        bot.sendMessage(chatId, "Please enter the new site name:");
    } else if (data === 'sitesettings_edit_tagline') {
        setUserState(userId, { command: 'sitesettings_update_tagline' });
        bot.sendMessage(chatId, "Please enter the new site tagline:");
    } else if (data === 'sitesettings_broadcast') {
        setUserState(userId, { command: 'sitesettings_update_broadcast' });
        bot.sendMessage(chatId, "Enter the announcement message to broadcast on the site. To deactivate, send 'clear'.");
    } else if (data === 'sitesettings_set_featured') {
        const movies = readMovies();
        if (movies.length === 0) {
            bot.answerCallbackQuery(query.id, { text: "No movies available to feature." });
            return;
        }
        const keyboard = movies.map(m => ([{ text: m.title, callback_data: `sitesettings_feature_${m.id}` }]));
        keyboard.push([{ text: "Clear Featured Movie", callback_data: "sitesettings_feature_clear" }]);
        bot.editMessageText("Select a movie to feature on the homepage:", {
            chat_id: chatId, message_id: messageId,
            reply_markup: { inline_keyboard: keyboard }
        });
    } else if (data.startsWith('sitesettings_feature_')) {
        const movieId = data.replace('sitesettings_feature_', '');
        const config = readConfig();
        config.featuredMovieId = movieId === 'clear' ? null : movieId;
        writeConfig(config);
        const movie = readMovies().find(m => m.id === movieId);
        const message = movieId === 'clear' ? "Featured movie has been cleared." : `"${movie?.title}" is now the featured movie.`;
        bot.answerCallbackQuery(query.id, { text: `✅ ${message}` });
        showSiteSettingsMenu(bot, chatId, messageId!);
    }
    
    if(!data.startsWith('sitesettings_feature_')) bot.answerCallbackQuery(query.id);
};

// --- MESSAGE HANDLER ---
export const handleSiteUpdateResponse = (bot: TelegramBot, msg: TelegramBot.Message) => {
    const userId = msg.from?.id;
    const text = msg.text;
    if (!userId || !text) return;

    const state = getUserState(userId);
    if (!state || !state.command.startsWith('sitesettings_update_')) return;

    const config = readConfig();

    if (state.command === 'sitesettings_update_name') {
        config.name = text;
        writeConfig(config);
        bot.sendMessage(userId, `✅ Success! Site name updated to "${text}".`);
    } else if (state.command === 'sitesettings_update_tagline') {
        config.tagline = text;
        writeConfig(config);
        bot.sendMessage(userId, `✅ Success! Site tagline has been updated.`);
    } else if (state.command === 'sitesettings_update_broadcast') {
        const isClear = text.toLowerCase() === 'clear';
        const announcement = {
            message: isClear ? "" : text,
            active: !isClear
        };
        atomicWrite(ANNOUNCEMENT_PATH, JSON.stringify(announcement, null, 2));
        const successMessage = isClear ? "Broadcast message has been cleared and deactivated." : `New broadcast message is now active: "${text}"`;
        bot.sendMessage(userId, `✅ Success! ${successMessage}`);
    }

    clearUserState(userId);
};