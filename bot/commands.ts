
import TelegramBot from 'node-telegram-bot-api';
import {
    startAddMovieFlow,
    handleAddMovieResponse,
    showMoviesForEditing,
    showMoviesForDeletion,
    handleEditMovieCallback,
    handleDeleteMovieCallback
} from './movieManager';
import { showSiteSettingsMenu, handleSiteSettingsCallback, handleSiteUpdateResponse } from './siteManager';
import { handleAiQuery, startAiChat, suggestNewMovies } from './aiHandler';
import { getUserState } from './utils';
import { UserState } from './types';
import { showCollectionsMenu, handleCollectionCallback } from './collectionManager';
import { startUserLookup, handleUserLookupResponse } from './userManager';
import { showMonitoringMenu, handleMonitoringCallback, handleMonitoringUpdateResponse } from './monitoringManager';
import { startAddActorFlow, handleActorResponse } from './actorManager';

// Main menu handler for the /start command
export const handleStartCommand = (bot: TelegramBot, msg: TelegramBot.Message) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "Welcome to the Yoruba Cinemax Admin Bot!", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🎬 Manage Movies", callback_data: "manage_movies" }, { text: "📚 Manage Collections", callback_data: "manage_collections" }],
                [{ text: "🎭 Manage Actors", callback_data: "manage_actors" }, { text: "👤 Manage Users", callback_data: "manage_users" }],
                [{ text: "🔭 YouTube Monitoring", callback_data: "monitoring_menu" }, { text: "⚙️ Site Settings", callback_data: "site_settings" }],
                [{ text: "🧠 AI Suggestions", callback_data: "ai_suggest" }, { text: "📊 AI Analytics", callback_data: "ai_analytics" }],
            ]
        }
    });
};

// Router for all callback queries from inline keyboards
export const handleCallbackQuery = (bot: TelegramBot, query: TelegramBot.CallbackQuery, refreshMonitoring?: () => void) => {
    if (!query.message || !query.data) return;

    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;

    const routeAction = (data: string) => {
        // Movie Management
        if (data === 'manage_movies') showMovieMenu(bot, chatId, messageId);
        else if (data === 'add_movie') startAddMovieFlow(bot, chatId);
        else if (data === 'edit_movie_select') showMoviesForEditing(bot, chatId, messageId);
        else if (data.startsWith('edit_movie_')) handleEditMovieCallback(bot, query);
        else if (data === 'delete_movie_select') showMoviesForDeletion(bot, chatId, messageId);
        else if (data.startsWith('delete_movie_')) handleDeleteMovieCallback(bot, query);
        
        // Collection Management
        else if (data === 'manage_collections') showCollectionsMenu(bot, chatId, messageId);
        else if (data.startsWith('collection_')) handleCollectionCallback(bot, query);

        // Actor Management
        else if (data === 'manage_actors') showActorMenu(bot, chatId, messageId);
        else if (data === 'add_actor') startAddActorFlow(bot, chatId);

        // Site Settings
        else if (data === 'site_settings') showSiteSettingsMenu(bot, chatId, messageId);
        else if (data.startsWith('sitesettings_')) handleSiteSettingsCallback(bot, query);
        
        // User Management
        else if (data === 'manage_users') showUserMenu(bot, chatId, messageId);
        else if (data === 'user_lookup') startUserLookup(bot, chatId);

        // Monitoring
        else if (data === 'monitoring_menu') showMonitoringMenu(bot, chatId, messageId);
        else if (data.startsWith('monitoring_')) handleMonitoringCallback(bot, query, refreshMonitoring);

        // AI Features
        else if (data === 'ai_analytics') startAiChat(bot, chatId);
        else if (data === 'ai_suggest') suggestNewMovies(bot, chatId);

        // Navigation
        else if (data === 'main_menu') handleStartCommand(bot, { chat: { id: chatId } } as TelegramBot.Message);
    }
    
    routeAction(data);
    bot.answerCallbackQuery(query.id);
};

// Handler for general messages, routing them based on user's current state
export const handleMessage = async (bot: TelegramBot, msg: TelegramBot.Message) => {
    const userId = msg.from?.id;
    if (!userId) return;

    const userState: UserState | undefined = getUserState(userId);
    if (!userState) return;
    
    // Route to the appropriate handler based on the command in the user's state
    const { command } = userState;
    if (command.startsWith('add_movie') || command.startsWith('edit_movie_')) await handleAddMovieResponse(bot, msg);
    else if (command.startsWith('collection_')) await handleCollectionCallback(bot, { message: msg } as TelegramBot.CallbackQuery);
    else if (command.startsWith('actor_')) await handleActorResponse(bot, msg);
    else if (command.startsWith('sitesettings_')) await handleSiteUpdateResponse(bot, msg);
    else if (command === 'user_lookup_email') await handleUserLookupResponse(bot, msg);
    else if (command.startsWith('monitoring_')) await handleMonitoringUpdateResponse(bot, msg);
    else if (command === 'ai_chat') await handleAiQuery(bot, msg);
};


// --- Sub-menus for cleaner routing ---

const showMovieMenu = (bot: TelegramBot, chatId: number, messageId: number) => {
    bot.editMessageText("🎬 Movie Management", {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
            inline_keyboard: [
                [{ text: "➕ Add New Movie", callback_data: "add_movie" }],
                [{ text: "✏️ Edit Movie", callback_data: "edit_movie_select" }],
                [{ text: "🗑️ Delete Movie", callback_data: "delete_movie_select" }],
                [{ text: "⬅️ Back to Main Menu", callback_data: "main_menu" }]
            ]
        }
    });
};

const showActorMenu = (bot: TelegramBot, chatId: number, messageId: number) => {
    bot.editMessageText("🎭 Actor Management\n\nUse this to add or update actor profiles. The AI can help generate bios and find photos.", {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
            inline_keyboard: [
                [{ text: "➕ Add/Update Actor Profile", callback_data: "add_actor" }],
                [{ text: "⬅️ Back to Main Menu", callback_data: "main_menu" }]
            ]
        }
    });
};

const showUserMenu = (bot: TelegramBot, chatId: number, messageId: number) => {
    bot.editMessageText("👤 User Management", {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
            inline_keyboard: [
                [{ text: "🔎 User Lookup", callback_data: "user_lookup" }],
                [{ text: "⬅️ Back to Main Menu", callback_data: "main_menu" }]
            ]
        }
    });
};