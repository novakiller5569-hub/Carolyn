// FIX: Declare '__dirname' to resolve TypeScript error about missing Node.js type definitions.
declare const __dirname: string;

import TelegramBot from 'node-telegram-bot-api';
import { GoogleGenAI, Type } from "@google/genai";
import { getAnalyticsSummary } from './analyticsService';
import { setUserState, getUserState, clearUserState } from './utils';
import fs from 'fs';
import path from 'path';
import { Movie, Actor } from './types';
import { atomicWrite } from './utils';

const MOVIES_PATH = path.join(__dirname, '../../data/movies.json');
const ACTORS_PATH = path.join(__dirname, '../../data/actors.json');

const apiKey = "AIzaSyB12BsvYrfH536bmxTj7Rdj3fY_ScjKecQ";

const ai = new GoogleGenAI({ apiKey });
const model = 'gemini-2.5-flash';

const readMovies = (): Movie[] => {
    try {
        const data = fs.readFileSync(MOVIES_PATH, 'utf-8');
        return JSON.parse(data);
    } catch {
        return [];
    }
};

const readActors = (): Actor[] => {
    try {
        const data = fs.readFileSync(ACTORS_PATH, 'utf-8');
        return JSON.parse(data);
    } catch { return []; }
};
const writeActors = (actors: Actor[]) => atomicWrite(ACTORS_PATH, JSON.stringify(actors, null, 2));

const endChatKeyboard = {
    inline_keyboard: [[{ text: "🔚 End Chat", callback_data: "ai_end_chat" }]]
};


export const startAiChat = (bot: TelegramBot, chatId: number) => {
    setUserState(chatId, { command: 'ai_chat' });
    bot.sendMessage(chatId, "🤖 You are now chatting with the Analytics AI. Ask me about site activity or the movie catalog. For example:\n- 'How is the site doing today?'\n- 'What movies are similar to Anikulapo?'", {
        reply_markup: endChatKeyboard
    });
};

export const endAiChat = (bot: TelegramBot, chatId: number, messageId: number) => {
    clearUserState(chatId);
    bot.editMessageText("🤖 AI chat session ended. You can now use other commands.", {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: [] } // Remove the button
    });
};


export const handleAiQuery = async (bot: TelegramBot, msg: TelegramBot.Message) => {
    const chatId = msg.chat.id;
    const query = msg.text;

    if (!query) return;

    await bot.sendChatAction(chatId, 'typing');

    try {
        let days = 1;
        if (query.toLowerCase().includes('last week')) days = 7;
        if (query.toLowerCase().includes('last month')) days = 30;

        const analytics = getAnalyticsSummary(days);
        const movies = readMovies();
        const movieContext = movies.map(m => `Title: ${m.title}, Genre: ${m.genre}, Category: ${m.category}`).join('\n');
        
        const systemInstruction = `You are a helpful AI assistant for the admin of Yoruba Cinemax. Provide concise, friendly, and natural language answers.
        
1.  **For analytics questions:** Use the provided data to summarize website performance.
2.  **For movie catalog questions:** (e.g., "suggest a thriller", "what's like Jagun Jagun?"), use the provided movie list. Do not mention movies outside this list.

**Analytics Data for the last ${days} day(s):**
- Visitors: ${analytics.dailyVisitors}
- New Sign-ups: ${analytics.todaysSignups}
- Most Popular Movies (by clicks):
  ${analytics.mostClicked.map((m, i) => `${i + 1}. ${m.title} (${m.clicks} clicks)`).join('\n') || 'No movie clicks recorded.'}
  
**Available Movie Catalog:**
${movieContext}
`;
        
        const response = await ai.models.generateContent({ model, contents: query, config: { systemInstruction } });
        bot.sendMessage(chatId, response.text, { reply_markup: endChatKeyboard });

    } catch (error) {
        console.error("Gemini API Error:", error);
        bot.sendMessage(chatId, "Sorry, I'm having trouble thinking right now. Please try again later.", { reply_markup: endChatKeyboard });
    }
};

export const suggestNewMovies = async (bot: TelegramBot, chatId: number) => {
    await bot.sendChatAction(chatId, 'typing');
    try {
        const currentMovies = readMovies();
        const existingTitles = currentMovies.map(m => m.title).join(', ');

        const response = await ai.models.generateContent({
            model,
            contents: `Find 3 popular or trending Yoruba movies that are NOT in this list: ${existingTitles}.`,
            config: {
                tools: [{ googleSearch: {} }],
            }
        });
        
        bot.sendMessage(chatId, `🧠 *AI Suggestions based on web search:*\n\n${response.text}`, { parse_mode: 'Markdown' });

    } catch(e) {
        bot.sendMessage(chatId, "Could not fetch suggestions at this time.");
        console.error(e);
    }
};

export const getWeeklyDigest = async (bot: TelegramBot) => {
    const adminId = process.env.ADMIN_TELEGRAM_USER_ID;
    if (!adminId) {
        console.log("Weekly Digest skipped: No Admin ID.");
        return;
    }
    
    console.log("Generating weekly digest...");
    await bot.sendChatAction(parseInt(adminId, 10), 'typing');
    try {
        const analytics = getAnalyticsSummary(7);
        const systemInstruction = `You are an AI assistant generating a weekly performance report for the admin of a movie website. Provide a concise, friendly summary using Markdown formatting. Highlight key numbers and trends.`;

        const prompt = `Here is the data for the last 7 days:
- Total Visitors: ${analytics.dailyVisitors}
- New Sign-ups: ${analytics.todaysSignups}
- Top 3 Most Clicked Movies: ${analytics.mostClicked.slice(0, 3).map(m => `${m.title} (${m.clicks} clicks)`).join(', ') || 'None'}

Please generate the weekly report.`;

        const response = await ai.models.generateContent({ model, contents: prompt, config: { systemInstruction } });

        const reportHeader = "📊 *Your Weekly Performance Report* 📊\n\n";
        bot.sendMessage(adminId, reportHeader + response.text, { parse_mode: 'Markdown' });

    } catch (e) {
        console.error("Failed to generate weekly digest:", e);
        bot.sendMessage(adminId, "Sorry, I couldn't generate the weekly report this time.");
    }
};

export const generateActorProfile = async (actorName: string): Promise<Partial<Actor> | null> => {
    try {
        const systemInstruction = `You are an AI data specialist. Find a concise one-paragraph biography and a direct URL to a high-quality, public-domain portrait image for the specified Yoruba movie actor. Use Google Search. Respond in JSON format. If no good image URL is found, the imageUrl should be null.`;
        const responseSchema = {
            type: Type.OBJECT, properties: {
                bio: { type: Type.STRING },
                imageUrl: { type: Type.STRING, description: "A direct link to a JPG/PNG image file, or null." }
            }
        };

        const response = await ai.models.generateContent({
            model,
            contents: `Find bio and image URL for actor: ${actorName}`,
            config: { systemInstruction, responseMimeType: "application/json", responseSchema, tools: [{ googleSearch: {} }] }
        });
        
        return JSON.parse(response.text);
    } catch (error) {
        console.error(`AI failed to generate profile for ${actorName}:`, error);
        return null;
    }
};


export const findNewTrendingMovie = async (existingMovieTitles: string[]): Promise<string | null> => {
    try {
        const systemInstruction = `You are a movie scout. Your goal is to find ONE new, popular, full-length Yoruba movie on YouTube that was released between 2022 and 2025.
- The movie must NOT be in the provided list of existing movie titles.
- It must be a FULL MOVIE, not a trailer, clip, or review.
- Prioritize movies from the current year.
- Use Google Search to find what's trending.
- If you find a suitable movie, respond with ONLY its YouTube URL and nothing else.
- If you cannot find a new movie that meets the criteria, respond with the word "null".`;
        
        const prompt = `Here are the movies we already have. Find a new one that is NOT on this list:\n\n${existingMovieTitles.join('\n')}`;

        const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
                systemInstruction,
                tools: [{ googleSearch: {} }],
                temperature: 0.8,
            }
        });

        const text = response.text.trim();
        if (text.toLowerCase() === 'null' || !text.startsWith('https://')) {
            return null;
        }
        return text;

    } catch (error) {
        console.error("AI failed to find a new trending movie:", error);
        return null;
    }
};
