// FIX: Declare '__dirname' to resolve TypeScript error about missing Node.js type definitions.
declare const __dirname: string;

import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';
import { Movie } from './types';
import { setUserState, getUserState, clearUserState, atomicWrite } from './utils';
import { GoogleGenAI, Type } from '@google/genai';
import { Buffer } from 'buffer';
import { URL } from 'url';

const MOVIES_PATH = path.join(__dirname, '../../data/movies.json');
const POSTERS_DIR = path.join(__dirname, '../../public/posters');

const apiKey = "AIzaSyB12BsvYrfH536bmxTj7Rdj3fY_ScjKecQ";
const ai = new GoogleGenAI({ apiKey });
const model = 'gemini-2.5-flash';

// Helper to read movies from the JSON file
const readMovies = (): Movie[] => {
    try {
        if (!fs.existsSync(MOVIES_PATH)) {
            return [];
        }
        const data = fs.readFileSync(MOVIES_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Error reading movies.json:", error);
        return [];
    }
};

// Helper to write movies to the JSON file
const writeMovies = (movies: Movie[]) => {
    atomicWrite(MOVIES_PATH, JSON.stringify(movies, null, 2));
};


// --- ADD MOVIE FLOW ---

export const startAddMovieFlow = (bot: TelegramBot, chatId: number, messageId: number) => {
    bot.editMessageText("How would you like to add this movie?", {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
            inline_keyboard: [
                [{ text: "🔗 From YouTube URL", callback_data: "add_movie_youtube" }],
                [{ text: "📝 Manually (Cinema)", callback_data: "add_movie_manual" }]
            ]
        }
    });
};

// --- MANUAL (CINEMA) MOVIE FLOW ---
const manualAddMovieSteps = [
    { key: 'title', prompt: "What is the movie's title?" },
    { key: 'description', prompt: "Please provide a short description, or type 'AI' to generate one from a web search." },
    { key: 'genre', prompt: "What is the genre? (e.g., Fantasy, Action)" },
    { key: 'category', prompt: "What is the category? (Drama, Comedy, Action, Romance, Thriller, Epic)" },
    { key: 'releaseDate', prompt: "What is the release date? (YYYY-MM-DD)" },
    { key: 'stars', prompt: "Who are the main stars? (Comma-separated, e.g., Femi Adebayo, Bimbo Ademoye)" },
    { key: 'runtime', prompt: "What is the runtime? (e.g., 2h 14m)" },
    { key: 'rating', prompt: "What is the rating? (A number from 1 to 10, e.g., 8.9)" },
    { key: 'trailerId', prompt: "What is the YouTube trailer ID? (Optional, send 'skip' if none)" },
    { key: 'downloadLink', prompt: "Enter the download URL for this cinema movie." },
    { key: 'poster', prompt: "Please send the movie poster image." },
];

export const startManualAddFlow = (bot: TelegramBot, chatId: number) => {
    const userId = chatId;
    setUserState(userId, {
        command: 'add_movie_manual',
        step: 0,
        movieData: {}
    });
    bot.sendMessage(chatId, `Let's add a new cinema movie. ${manualAddMovieSteps[0].prompt}`);
};

// --- YOUTUBE MOVIE FLOW ---
export const startYouTubeAddFlow = (bot: TelegramBot, chatId: number) => {
    const userId = chatId;
    setUserState(userId, { command: 'add_movie_youtube_url' });
    bot.sendMessage(chatId, "Please send the full YouTube video URL for the movie.");
};

// --- UNIVERSAL RESPONSE HANDLER ---
export const handleAddMovieResponse = async (bot: TelegramBot, msg: TelegramBot.Message) => {
    const userId = msg.from?.id;
    if (!userId) return;

    const state = getUserState(userId);
    if (!state || !state.command.startsWith('add_movie')) return;

    if (state.command.startsWith('add_movie_manual')) {
        await handleManualMovieResponse(bot, msg);
    } else if (state.command.startsWith('add_movie_youtube')) {
        await handleYouTubeMovieResponse(bot, msg);
    }
};

const handleManualMovieResponse = async (bot: TelegramBot, msg: TelegramBot.Message) => {
    const userId = msg.from!.id;
    const state = getUserState(userId)!;
    const currentStep = manualAddMovieSteps[state.step!];

    if (currentStep.key === 'poster') {
        if (!msg.photo) {
            bot.sendMessage(userId, "That doesn't look like an image. Please send the poster.");
            return;
        }
        try {
            // Logic to save poster...
            await bot.sendChatAction(userId, 'upload_photo');
            const posterPath = await savePoster(bot, msg, state.movieData.title);
            state.movieData.poster = posterPath;
            state.movieData.id = state.movieData.title.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
        } catch (error) {
            console.error("Error saving poster:", error);
            bot.sendMessage(userId, "Sorry, there was an error saving the poster. Please try again.");
            return;
        }
    } else {
        if (!msg.text) {
             bot.sendMessage(userId, "Invalid input. Please provide the requested information.");
             return;
        }
        if (currentStep.key === 'description' && msg.text.toLowerCase() === 'ai') {
            await bot.sendChatAction(userId, 'typing');
            try {
                const response = await ai.models.generateContent({
                    model,
                    contents: `Find a compelling, single, well-detailed movie description (around 40-50 words, one paragraph) for the Yoruba movie titled "${state.movieData.title}". Search the web for official summaries or reviews.`,
                    config: { tools: [{ googleSearch: {} }] }
                });
                state.movieData.description = response.text;
                bot.sendMessage(userId, `🤖 AI Generated Description:\n\n_"${response.text}"_`);
            } catch (e) {
                bot.sendMessage(userId, "AI failed to generate a description. Please enter one manually.");
                return;
            }
        } else if (msg.text.toLowerCase() === 'skip' && currentStep.key === 'trailerId') {
            state.movieData[currentStep.key] = undefined;
        } else {
            state.movieData[currentStep.key] = msg.text;
        }
    }

    const nextStepIndex = state.step! + 1;
    if (nextStepIndex < manualAddMovieSteps.length) {
        state.step = nextStepIndex;
        setUserState(userId, state);
        setTimeout(() => bot.sendMessage(userId, manualAddMovieSteps[nextStepIndex].prompt), 500);
    } else {
        const movies = readMovies();
        if (movies.find(m => m.title.toLowerCase() === state.movieData.title.toLowerCase())) {
            bot.sendMessage(userId, `❌ Error! A movie titled "${state.movieData.title}" already exists.`);
            clearUserState(userId);
            return;
        }
        const newMovie: Movie = {
            id: state.movieData.id,
            title: state.movieData.title,
            poster: state.movieData.poster,
            downloadLink: state.movieData.downloadLink,
            genre: state.movieData.genre,
            category: state.movieData.category,
            releaseDate: state.movieData.releaseDate,
            stars: state.movieData.stars.split(',').map((s: string) => s.trim()),
            runtime: state.movieData.runtime,
            rating: parseFloat(state.movieData.rating),
            description: state.movieData.description,
            trailerId: state.movieData.trailerId,
            popularity: 70, 
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        writeMovies([...movies, newMovie]);
        bot.sendMessage(userId, `✅ Success! Movie "${newMovie.title}" has been added.`);
        clearUserState(userId);
    }
};

const handleYouTubeMovieResponse = async (bot: TelegramBot, msg: TelegramBot.Message) => {
    const userId = msg.from!.id;
    const state = getUserState(userId)!;

    if (state.command === 'add_movie_youtube_url') {
        const url = msg.text;
        if (!url || !(url.includes('youtube.com') || url.includes('youtu.be'))) {
            bot.sendMessage(userId, "That doesn't look like a valid YouTube URL. Please try again.");
            return;
        }
        
        state.movieData = { downloadLink: url };
        bot.sendMessage(userId, "⏳ Processing YouTube link... The AI is gathering details, this might take a moment.");
        await bot.sendChatAction(userId, 'typing');

        try {
            const systemInstruction = `You are an AI data extraction tool. From the provided YouTube movie URL, extract the following details for the specific Yoruba movie in the video and respond in a single, valid JSON object:
- "title": The clean, official movie title. Do not include extra text like "Full Movie", "Official Trailer", etc.
- "description": A compelling 30-40 word summary you generate by searching the web for the movie's plot.
- "stars": An array of the top 3-4 main actors.
- "genre": A single primary genre (e.g., "Drama", "Action", "Epic").
- "category": Choose the best fit from 'Drama', 'Comedy', 'Action', 'Romance', 'Thriller', 'Epic'.
- "posterUrl": A direct, publicly accessible link to a high-quality JPG or PNG image file for the movie's poster. Do NOT provide a URL to a webpage. If a valid direct image link cannot be found, set this value to null.
- "releaseDate": Today's date in YYYY-MM-DD format.`;
            const responseSchema = {
                type: Type.OBJECT, properties: {
                    title: { type: Type.STRING }, description: { type: Type.STRING },
                    stars: { type: Type.ARRAY, items: { type: Type.STRING } },
                    genre: { type: Type.STRING }, category: { type: Type.STRING },
                    releaseDate: { type: Type.STRING }, posterUrl: { type: Type.STRING }
                },
                required: ['title', 'description', 'stars', 'genre', 'category', 'posterUrl', 'releaseDate']
            };

            const response = await ai.models.generateContent({
                model, contents: `Extract full movie details for this YouTube video: ${url}`,
                config: { systemInstruction, responseMimeType: "application/json", responseSchema, tools: [{ googleSearch: {} }] }
            });

            const details = JSON.parse(response.text);
            Object.assign(state.movieData, details);

            // Attempt to download the poster automatically
            const posterPath = await downloadImage(details.posterUrl, details.title);

            if (posterPath) {
                // SUCCESS: Poster downloaded, finish adding the movie
                state.movieData.poster = posterPath;
                const movies = readMovies();
                if (movies.find(m => m.title.toLowerCase() === state.movieData.title.toLowerCase())) {
                    bot.sendMessage(userId, `❌ Error! A movie titled "${state.movieData.title}" already exists.`);
                    clearUserState(userId);
                    return;
                }
                const newMovie: Movie = {
                    id: state.movieData.title.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30),
                    title: state.movieData.title, poster: state.movieData.poster,
                    downloadLink: state.movieData.downloadLink, genre: state.movieData.genre,
                    category: state.movieData.category, releaseDate: state.movieData.releaseDate,
                    stars: state.movieData.stars, runtime: "N/A", rating: 7.0,
                    description: state.movieData.description, popularity: 75,
                    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
                };
                writeMovies([...movies, newMovie]);
                bot.sendMessage(userId, `✅ Success! Movie "${newMovie.title}" has been added automatically from YouTube.`);
                clearUserState(userId);
            } else {
                // FAILURE: Poster download failed, ask user to provide one
                state.command = 'add_movie_youtube_poster_manual';
                setUserState(userId, state);
                bot.sendMessage(userId, `🤖 AI has gathered details for "${details.title}", but could not download a valid poster. Please send a poster image manually to finish adding the movie.`);
            }

        } catch (e) {
            console.error(e);
            bot.sendMessage(userId, "❌ The AI failed to process this URL. Please try a different one or add the movie manually.");
            clearUserState(userId);
        }
    } else if (state.command === 'add_movie_youtube_poster_manual') {
        if (!msg.photo) {
            bot.sendMessage(userId, "That's not an image. Please send the poster image.");
            return;
        }
        try {
            await bot.sendChatAction(userId, 'upload_photo');
            const posterPath = await savePoster(bot, msg, state.movieData.title);
            state.movieData.poster = posterPath;

            const movies = readMovies();
            if (movies.find(m => m.title.toLowerCase() === state.movieData.title.toLowerCase())) {
                bot.sendMessage(userId, `❌ Error! A movie titled "${state.movieData.title}" already exists.`);
                clearUserState(userId);
                return;
            }

            const newMovie: Movie = {
                id: state.movieData.title.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30),
                title: state.movieData.title, poster: state.movieData.poster,
                downloadLink: state.movieData.downloadLink, genre: state.movieData.genre,
                category: state.movieData.category, releaseDate: state.movieData.releaseDate,
                stars: state.movieData.stars, runtime: "N/A", rating: 7.0,
                description: state.movieData.description, popularity: 75,
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
            };
            writeMovies([...movies, newMovie]);
            bot.sendMessage(userId, `✅ Success! Movie "${newMovie.title}" has been added from YouTube with your provided poster.`);
            clearUserState(userId);

        } catch (error) {
            console.error("Error saving poster for YouTube movie:", error);
            bot.sendMessage(userId, "Sorry, there was an error with the poster. Please try the process again.");
            clearUserState(userId);
        }
    }
};

async function savePoster(bot: TelegramBot, msg: TelegramBot.Message, title: string): Promise<string> {
    const largestPhoto = msg.photo![msg.photo!.length - 1];
    const fileId = largestPhoto.file_id;
    if (!fs.existsSync(POSTERS_DIR)) fs.mkdirSync(POSTERS_DIR, { recursive: true });
    
    const movieId = (title || `movie-${Date.now()}`).toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
    const posterFileName = `${movieId}-${Date.now()}.jpg`;
    const posterPath = path.join(POSTERS_DIR, posterFileName);
    
    const downloadStream = bot.getFileStream(fileId);
    const writeStream = fs.createWriteStream(posterPath);
    downloadStream.pipe(writeStream);

    await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
    });
    return `/posters/${posterFileName}`;
}

// --- AUTONOMOUS MOVIE CREATION ---

async function downloadImage(url: string | null, title: string): Promise<string | null> {
    if (!url || !url.startsWith('http')) {
        console.log(`Skipping download: Invalid or null URL provided for ${title}.`);
        return null;
    }

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        }
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.startsWith('image/')) {
            throw new Error(`URL is not a direct image link. Content-Type: ${contentType}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        if (!fs.existsSync(POSTERS_DIR)) {
            fs.mkdirSync(POSTERS_DIR, { recursive: true });
        }

        const movieId = title.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
        const pathname = new URL(url).pathname;
        const extension = path.extname(pathname) || '.jpg';
        const posterFileName = `${movieId}-${Date.now()}${extension}`;
        const posterPath = path.join(POSTERS_DIR, posterFileName);

        fs.writeFileSync(posterPath, buffer);
        
        return `/posters/${posterFileName}`;
    } catch (error) {
        console.error(`Error downloading image for "${title}" from ${url}:`, error);
        return null;
    }
}

export const createMovieFromYouTube = async (youtubeUrl: string): Promise<Movie | null> => {
    try {
        const systemInstruction = `You are an AI data extraction tool. From the provided YouTube movie URL, extract the following details for the specific Yoruba movie in the video and respond in a single, valid JSON object:
- "title": The clean, official movie title. Do not include extra text like "Full Movie", "Official Trailer", etc.
- "description": A compelling 30-40 word summary you generate by searching the web for the movie's plot.
- "stars": An array of the top 3-4 main actors.
- "genre": A single primary genre (e.g., "Drama", "Action", "Epic").
- "category": Choose the best fit from 'Drama', 'Comedy', 'Action', 'Romance', 'Thriller', 'Epic'.
- "posterUrl": A direct, publicly accessible link to a high-quality JPG or PNG image file for the movie's poster. Do NOT provide a URL to a webpage. If a valid direct image link cannot be found, set this value to null.
- "releaseDate": The movie's release year or full date (YYYY-MM-DD). If unknown, use today's date.
- "runtime": The approximate runtime (e.g., "2h 15m"). If unknown, use "N/A".`;
        
        const responseSchema = {
            type: Type.OBJECT, properties: {
                title: { type: Type.STRING }, description: { type: Type.STRING },
                stars: { type: Type.ARRAY, items: { type: Type.STRING } },
                genre: { type: Type.STRING }, category: { type: Type.STRING },
                releaseDate: { type: Type.STRING }, posterUrl: { type: Type.STRING },
                runtime: { type: Type.STRING },
            },
            required: ['title', 'description', 'stars', 'genre', 'category', 'posterUrl', 'releaseDate', 'runtime']
        };

        const response = await ai.models.generateContent({
            model, contents: `Extract full movie details for this YouTube video: ${youtubeUrl}`,
            config: { systemInstruction, responseMimeType: "application/json", responseSchema, tools: [{ googleSearch: {} }] }
        });

        const details = JSON.parse(response.text);

        // Download the poster
        const posterLocalPath = await downloadImage(details.posterUrl, details.title);
        
        if (!posterLocalPath) {
            console.log(`Autonomous Finder: Could not download poster for "${details.title}". Aborting movie creation.`);
            return null; // Indicate failure due to poster
        }
        
        const newMovie: Movie = {
            id: details.title.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30) + `-${Date.now().toString().slice(-4)}`, // Add timestamp to avoid collisions
            title: details.title, poster: posterLocalPath, downloadLink: youtubeUrl,
            genre: details.genre, category: details.category, releaseDate: details.releaseDate,
            stars: details.stars, runtime: details.runtime,
            rating: 7.0 + parseFloat((Math.random() * 2).toFixed(1)), // Assign a plausible random rating
            description: details.description,
            popularity: 70 + Math.floor(Math.random() * 15), // Assign plausible popularity
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        };

        return newMovie;

    } catch (error) {
        console.error("AI processing or poster download failed:", error);
        return null;
    }
};


// --- EDIT/DELETE FLOWS ---
export const showMoviesForEditing = (bot: TelegramBot, chatId: number, messageId: number) => {
    // Implementation is complex, keeping it simple for now
    bot.editMessageText("Editing movie details is a planned feature.", { chat_id: chatId, message_id: messageId });
};

export const handleEditMovieCallback = (bot: TelegramBot, query: TelegramBot.CallbackQuery) => {
    bot.answerCallbackQuery(query.id, { text: "Feature coming soon!" });
};

export const showMoviesForDeletion = (bot: TelegramBot, chatId: number, messageId: number) => {
    const movies = readMovies();
    if (movies.length === 0) {
        bot.editMessageText("There are no movies to delete.", { chat_id: chatId, message_id: messageId });
        return;
    }
    const keyboard = movies.map(movie => ([{ text: movie.title, callback_data: `delete_movie_confirm_${movie.id}` }]));
    keyboard.push([{ text: "⬅️ Back", callback_data: 'manage_movies' }]);

    bot.editMessageText("🗑️ Select a movie to delete:", {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
            inline_keyboard: keyboard
        }
    });
};

export const handleDeleteMovieCallback = (bot: TelegramBot, query: TelegramBot.CallbackQuery) => {
    const chatId = query.message?.chat.id;
    const messageId = query.message?.message_id;
    const data = query.data;
    if (!chatId || !messageId || !data) return;

    const confirmPrefix = 'delete_movie_confirm_';
    const executePrefix = 'delete_movie_execute_';

    if (data.startsWith(confirmPrefix)) {
        const movieId = data.substring(confirmPrefix.length);
        const movie = readMovies().find(m => m.id === movieId);
        if (movie) {
            bot.editMessageText(`Are you sure you want to delete "${movie.title}"? This cannot be undone.`, {
                chat_id: chatId, message_id: messageId,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🔥 Yes, Delete It", callback_data: `delete_movie_execute_${movieId}` },
                         { text: "⬅️ Cancel", callback_data: "delete_movie_select" }]
                    ]
                }
            });
        }
    } else if (data.startsWith(executePrefix)) {
        const movieId = data.substring(executePrefix.length);
        const movies = readMovies();
        const movieToDelete = movies.find(m => m.id === movieId);
        const updatedMovies = movies.filter(m => m.id !== movieId);

        if (movies.length !== updatedMovies.length && movieToDelete) {
            writeMovies(updatedMovies);
            try {
                if (movieToDelete.poster.startsWith('/posters/')) {
                    const posterPath = path.join(__dirname, '../../public', movieToDelete.poster);
                    if (fs.existsSync(posterPath)) fs.unlinkSync(posterPath);
                }
            } catch (err) {
                console.error(`Could not delete poster for movie ID ${movieId}:`, err);
            }
            bot.editMessageText(`✅ Success! Movie "${movieToDelete.title}" has been deleted.`, { chat_id: chatId, message_id: messageId });
        } else {
            bot.editMessageText(`Error: Movie with ID ${movieId} not found.`, { chat_id: chatId, message_id: messageId });
        }
    }
};
