// FIX: Declare '__dirname' to resolve TypeScript error about missing Node.js type definitions.
declare const __dirname: string;

import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';
import { Movie } from './types';
import { setUserState, getUserState, clearUserState, atomicWrite } from './utils';
import { GoogleGenAI } from '@google/genai';

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

const addMovieSteps = [
    { key: 'title', prompt: "What is the movie's title?" },
    { key: 'description', prompt: "Please provide a short description, or type 'AI' to generate one." },
    { key: 'genre', prompt: "What is the genre? (e.g., Fantasy, Action)" },
    { key: 'category', prompt: "What is the category? (Drama, Comedy, Action, Romance, Thriller, Epic)" },
    { key: 'releaseDate', prompt: "What is the release date? (YYYY-MM-DD)" },
    { key: 'stars', prompt: "Who are the main stars? (Comma-separated, e.g., Femi Adebayo, Bimbo Ademoye)" },
    { key: 'runtime', prompt: "What is the runtime? (e.g., 2h 14m)" },
    { key: 'rating', prompt: "What is the rating? (A number from 1 to 10, e.g., 8.9)" },
    { key: 'trailerId', prompt: "What is the YouTube trailer ID? (Optional, send 'skip' if none)" },
    { key: 'poster', prompt: "Please send the movie poster image." },
];

export const startAddMovieFlow = (bot: TelegramBot, chatId: number) => {
    const userId = chatId; 
    setUserState(userId, {
        command: 'add_movie',
        step: 0,
        movieData: {}
    });
    bot.sendMessage(chatId, `Let's add a new movie. ${addMovieSteps[0].prompt}`);
};

export const handleAddMovieResponse = async (bot: TelegramBot, msg: TelegramBot.Message) => {
    const userId = msg.from?.id;
    if (!userId) return;

    const state = getUserState(userId);
    if (!state || !state.command.startsWith('add_movie') || typeof state.step !== 'number') return;

    const currentStep = addMovieSteps[state.step];

    // Handle poster upload
    if (currentStep.key === 'poster') {
        if (!msg.photo) {
            bot.sendMessage(userId, "That doesn't look like an image. Please send the poster.");
            return;
        }
        try {
            await bot.sendChatAction(userId, 'upload_photo');
            const largestPhoto = msg.photo[msg.photo.length - 1];
            const fileId = largestPhoto.file_id;

            if (!fs.existsSync(POSTERS_DIR)) fs.mkdirSync(POSTERS_DIR, { recursive: true });
            
            const movieId = (state.movieData.title || `movie-${Date.now()}`).toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
            const posterFileName = `${movieId}-${Date.now()}.jpg`;
            const posterPath = path.join(POSTERS_DIR, posterFileName);
            
            const downloadStream = bot.getFileStream(fileId);
            const writeStream = fs.createWriteStream(posterPath);
            downloadStream.pipe(writeStream);

            await new Promise<void>((resolve, reject) => {
                writeStream.on('finish', () => resolve());
                writeStream.on('error', reject);
            });

            state.movieData.poster = `/posters/${posterFileName}`;
            state.movieData.id = movieId;

        } catch (error) {
            console.error("Error saving poster:", error);
            bot.sendMessage(userId, "Sorry, there was an error saving the poster. Please try again.");
            return;
        }
    } else { // Handle text responses
        if (!msg.text) {
             bot.sendMessage(userId, "Invalid input. Please provide the requested information.");
             return;
        }
        
        // AI Description Generation
        if (currentStep.key === 'description' && msg.text.toLowerCase() === 'ai') {
            await bot.sendChatAction(userId, 'typing');
            try {
                const response = await ai.models.generateContent({
                    model,
                    contents: `Generate a compelling, short movie description (around 30-40 words) for a Yoruba movie titled "${state.movieData.title}".`,
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

    // Move to the next step or finish
    const nextStepIndex = state.step + 1;
    if (nextStepIndex < addMovieSteps.length) {
        state.step = nextStepIndex;
        setUserState(userId, state);
        // Delay slightly after AI description for better UX
        setTimeout(() => bot.sendMessage(userId, addMovieSteps[nextStepIndex].prompt), 500);
    } else {
        const movies = readMovies();
        const newMovie: Movie = {
            id: state.movieData.id,
            title: state.movieData.title,
            poster: state.movieData.poster,
            downloadLink: "#",
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

// --- EDIT/DELETE FLOWS (placeholders, similar logic to previous version) ---
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
