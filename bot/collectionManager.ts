// FIX: Declare '__dirname' to resolve TypeScript error about missing Node.js type definitions.
declare const __dirname: string;

import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';
import { Collection, Movie } from './types';
import { setUserState, getUserState, clearUserState, atomicWrite } from './utils';

const COLLECTIONS_PATH = path.join(__dirname, '../../data/collections.json');
const MOVIES_PATH = path.join(__dirname, '../../data/movies.json');

const readCollections = (): Collection[] => {
    try {
        const data = fs.readFileSync(COLLECTIONS_PATH, 'utf-8');
        return JSON.parse(data);
    } catch { return []; }
};
const writeCollections = (collections: Collection[]) => atomicWrite(COLLECTIONS_PATH, JSON.stringify(collections, null, 2));

const readMovies = (): Movie[] => {
    try {
        const data = fs.readFileSync(MOVIES_PATH, 'utf-8');
        return JSON.parse(data);
    } catch { return []; }
};


// --- MAIN MENU ---
export const showCollectionsMenu = (bot: TelegramBot, chatId: number, messageId: number) => {
    bot.editMessageText("📚 *Collections Management*", {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: "➕ Create Collection", callback_data: "collection_create_start" }],
                [{ text: "✏️ Edit Collection", callback_data: "collection_edit_select" }],
                [{ text: "🗑️ Delete Collection", callback_data: "collection_delete_select" }],
                [{ text: "⬅️ Back to Main Menu", callback_data: "main_menu" }]
            ]
        }
    });
};

// --- CALLBACK ROUTER ---
export const handleCollectionCallback = async (bot: TelegramBot, query: TelegramBot.CallbackQuery) => {
    const data = query.data || getUserState(query.message!.from!.id)?.tempData;
    const msg = query.message!;
    const userId = msg.from!.id;
    const state = getUserState(userId);

    if (data === 'collection_create_start') {
        setUserState(userId, { command: 'collection_create_title', collectionData: {} });
        bot.sendMessage(msg.chat.id, "Enter the title for the new collection:");
    } else if (state?.command === 'collection_create_title') {
        state.collectionData.title = msg.text;
        state.command = 'collection_create_desc';
        setUserState(userId, state);
        bot.sendMessage(msg.chat.id, "Great. Now enter a short description for it:");
    } else if (state?.command === 'collection_create_desc') {
        state.collectionData.description = msg.text;
        state.command = 'collection_create_movies';
        setUserState(userId, state);
        bot.sendMessage(msg.chat.id, "Finally, provide the movie IDs to include, separated by commas (e.g., jagun-jagun,anikalupo):");
    } else if (state?.command === 'collection_create_movies') {
        const movieIds = msg.text!.split(',').map(id => id.trim());
        const collections = readCollections();
        const newCollection: Collection = {
            id: state.collectionData.title.toLowerCase().replace(/[^a-z0-9]/g, '-'),
            title: state.collectionData.title,
            description: state.collectionData.description,
            movieIds,
        };
        writeCollections([...collections, newCollection]);
        bot.sendMessage(msg.chat.id, `✅ Collection "${newCollection.title}" created successfully!`);
        clearUserState(userId);
    }
    // Add edit/delete logic here...
    else if (data === 'collection_delete_select') {
        const collections = readCollections();
         bot.editMessageText("Select a collection to delete:", {
            chat_id: msg.chat.id, message_id: msg.message_id,
            reply_markup: {
                inline_keyboard: collections.map(c => ([{ text: c.title, callback_data: `collection_delete_exec_${c.id}` }]))
            }
        });
    } else if (data && data.startsWith('collection_delete_exec_')) {
        const collectionId = data.replace('collection_delete_exec_', '');
        const updatedCollections = readCollections().filter(c => c.id !== collectionId);
        writeCollections(updatedCollections);
        bot.answerCallbackQuery(query.id, { text: "Collection deleted!" });
        showCollectionsMenu(bot, msg.chat.id, msg.message_id);
    }

    if(query.id) bot.answerCallbackQuery(query.id);
};
