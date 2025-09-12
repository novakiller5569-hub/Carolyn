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
const PROGRESS_PATH = path.join(__dirname, '../../data/channelProgress.json');

const YOUTUBE_API_KEY = 'AIzaSyAPpw-HEzuGxm9vSTfWvWN5xE1P-Htcic4';
const GEMINI_API_KEY = "AIzaSyB12BsvYrfH536bmxTj7Rdj3fY_ScjKecQ";

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const model = 'gemini-2.5-flash';

// Helper to read movies from the JSON file
const readMovies = (): Movie[] => {
    try {
        if (!fs.existsSync(MOVIES_PATH)) return [];
        const data = fs.readFileSync(MOVIES_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Error reading movies.json:", error);
        return [];
    }
};
const writeMovies = (movies: Movie[]) => atomicWrite(MOVIES_PATH, JSON.stringify(movies, null, 2));

const readProgress = (): Record<string, { lastPageToken?: string; processedVideoIds: string[] }> => {
    try {
        if (!fs.existsSync(PROGRESS_PATH)) return {};
        return JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf-8'));
    } catch { return {}; }
};
const writeProgress = (progress: any) => atomicWrite(PROGRESS_PATH, JSON.stringify(progress, null, 2));


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
            updatedAt: new Date().toISOString(),
            seriesTitle: state.movieData.title, // Assume manual adds are part 1
            partNumber: 1
        };
        writeMovies([...movies, newMovie]);
        bot.sendMessage(userId, `✅ Success! Movie "${newMovie.title}" has been added.`);
        clearUserState(userId);
    }
};

const getBestThumbnail = (thumbnails: any): string | null => {
    if (!thumbnails) return null;
    return thumbnails.maxres?.url || thumbnails.high?.url || thumbnails.medium?.url || thumbnails.standard?.url || null;
};

const parseDuration = (duration: string): number => {
    const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
    const matches = duration.match(regex);
    if (!matches) return 0;
    const hours = parseInt(matches[1] || '0');
    const minutes = parseInt(matches[2] || '0');
    return (hours * 60) + minutes;
};


const fetchYouTubeVideoDetails = async (videoIds: string[]): Promise<any[] | null> => {
    if (videoIds.length === 0) return [];
    const ids = videoIds.join(',');
    try {
        const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${ids}&key=${YOUTUBE_API_KEY}`);
        if (!response.ok) return null;
        const data = await response.json();
        return (data.items && data.items.length > 0) ? data.items : [];
    } catch (error) {
        console.error("Error fetching from YouTube API:", error);
        return null;
    }
};


const handleYouTubeMovieResponse = async (bot: TelegramBot, msg: TelegramBot.Message) => {
    const userId = msg.from!.id;
    const state = getUserState(userId)!;
    const extractVideoId = (url: string): string | null => {
        const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
        const match = url.match(regex);
        return match ? match[1] : null;
    };
    
    if (state.command === 'add_movie_youtube_url') {
        const url = msg.text;
        const videoId = extractVideoId(url!);
        if (!url || !videoId) {
            bot.sendMessage(userId, "That doesn't look like a valid YouTube URL. Please try again.");
            return;
        }
        
        bot.sendMessage(userId, "⏳ Calling YouTube API... The AI will then arrange and correct the metadata.");
        await bot.sendChatAction(userId, 'typing');

        const videoDetailsArr = await fetchYouTubeVideoDetails([videoId]);
        if (!videoDetailsArr || videoDetailsArr.length === 0) {
            bot.sendMessage(userId, "Could not fetch details for this YouTube URL. It might be invalid or the video is private.");
            clearUserState(userId);
            return;
        }
        const videoDetails = videoDetailsArr[0];
        const { title, description, publishedAt } = videoDetails.snippet;
        const durationMinutes = parseDuration(videoDetails.contentDetails.duration);
        
        if (durationMinutes < 15) {
             bot.sendMessage(userId, `⚠️ This video is only ${durationMinutes} minutes long. It's likely a trailer. The movie has NOT been added. Please provide a link to the full movie.`);
             clearUserState(userId);
             return;
        }
        
        const thumbnailUrl = getBestThumbnail(videoDetails.snippet.thumbnails);
        if (!thumbnailUrl) {
            bot.sendMessage(userId, "Could not find a thumbnail for this video. Cannot proceed.");
            clearUserState(userId);
            return;
        }

        try {
            const systemInstruction = `You are an AI data enrichment tool. Given a movie's YouTube title and description, clean the data and find details from the web. Respond in a single, valid JSON object with the following fields:
- "title": The clean, official movie title. Include the part number if present (e.g., "Jagun Jagun Part 2").
- "seriesTitle": The name of the series. For "Jagun Jagun Part 2", this would be "Jagun Jagun". If it's not a series, this should be the same as the title.
- "partNumber": The part number as an integer (e.g., 2). If it's the first or only part, this must be 1.
- "description": A compelling 30-40 word summary based on the provided description and web search.
- "stars": An array of the top 3-4 main actors.
- "genre": A single primary genre (e.g., "Drama", "Action", "Epic").
- "category": Choose the best fit from 'Drama', 'Comedy', 'Action', 'Romance', 'Thriller', 'Epic'.`;
            const responseSchema = {
                type: Type.OBJECT, properties: {
                    title: { type: Type.STRING },
                    seriesTitle: { type: Type.STRING },
                    partNumber: { type: Type.NUMBER },
                    description: { type: Type.STRING },
                    stars: { type: Type.ARRAY, items: { type: Type.STRING } },
                    genre: { type: Type.STRING },
                    category: { type: Type.STRING }
                },
                required: ['title', 'seriesTitle', 'partNumber', 'description', 'stars', 'genre', 'category']
            };

            const response = await ai.models.generateContent({
                model, contents: `Enrich this movie data. YouTube Title: "${title}". YouTube Description: "${description}"`,
                config: { systemInstruction, responseMimeType: "application/json", responseSchema, tools: [{ googleSearch: {} }] }
            });

            const details = JSON.parse(response.text);
            const posterPath = await downloadImage(thumbnailUrl, details.title);
            if (!posterPath) throw new Error("Failed to download thumbnail.");

            const movies = readMovies();
            if (movies.find(m => m.title.toLowerCase() === details.title.toLowerCase())) {
                bot.sendMessage(userId, `❌ Error! A movie titled "${details.title}" already exists.`);
                clearUserState(userId);
                return;
            }

            const newMovie: Movie = {
                id: details.title.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30),
                title: details.title, poster: posterPath,
                downloadLink: url, genre: details.genre,
                category: details.category, releaseDate: publishedAt,
                stars: details.stars, runtime: `${durationMinutes}m`, rating: 7.0,
                description: details.description, popularity: 75,
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
                seriesTitle: details.seriesTitle,
                partNumber: details.partNumber
            };
            writeMovies([...movies, newMovie]);
            bot.sendMessage(userId, `✅ Success! Movie "${newMovie.title}" has been added automatically from YouTube.`);
            clearUserState(userId);

        } catch (e) {
            console.error(e);
            bot.sendMessage(userId, "❌ The AI failed to process this URL. Please try a different one or add the movie manually.");
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

async function downloadImage(url: string, title: string): Promise<string | null> {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.startsWith('image/')) throw new Error(`URL is not a direct image link.`);

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        if (!fs.existsSync(POSTERS_DIR)) fs.mkdirSync(POSTERS_DIR, { recursive: true });

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

export const createMovieFromYouTube = async (videoDetails: any): Promise<Movie | null> => {
    try {
        const { title, description, thumbnails, publishedAt } = videoDetails.snippet;
        const durationMinutes = parseDuration(videoDetails.contentDetails.duration);
        const thumbnailUrl = getBestThumbnail(thumbnails);

        if (!thumbnailUrl) {
            console.log(`Autonomous Finder: No thumbnail found for "${title}".`);
            return null;
        }

        const systemInstruction = `You are an AI data enrichment tool. Given a movie's YouTube title and description, clean the data and find details from the web. Respond in a single, valid JSON object with the following fields:
- "title": The clean, official movie title. Include the part number if present (e.g., "Jagun Jagun Part 2").
- "seriesTitle": The name of the series. For "Jagun Jagun Part 2", this would be "Jagun Jagun". If it's not a series, this should be the same as the title.
- "partNumber": The part number as an integer (e.g., 2). If it's the first or only part, this must be 1.
- "description": A compelling 30-40 word summary based on the provided description and web search.
- "stars": An array of the top 3-4 main actors.
- "genre": A single primary genre (e.g., "Drama", "Action", "Epic").
- "category": Choose the best fit from 'Drama', 'Comedy', 'Action', 'Romance', 'Thriller', 'Epic'.`;
        
        const responseSchema = {
            type: Type.OBJECT, properties: {
                title: { type: Type.STRING },
                seriesTitle: { type: Type.STRING },
                partNumber: { type: Type.NUMBER },
                description: { type: Type.STRING },
                stars: { type: Type.ARRAY, items: { type: Type.STRING } },
                genre: { type: Type.STRING },
                category: { type: Type.STRING }
            },
            required: ['title', 'seriesTitle', 'partNumber', 'description', 'stars', 'genre', 'category']
        };

        const response = await ai.models.generateContent({
            model, contents: `Enrich this movie data. YouTube Title: "${title}". YouTube Description: "${description}"`,
            config: { systemInstruction, responseMimeType: "application/json", responseSchema, tools: [{ googleSearch: {} }] }
        });

        const details = JSON.parse(response.text);
        const posterLocalPath = await downloadImage(thumbnailUrl, details.title);
        if (!posterLocalPath) return null;
        
        const newMovie: Movie = {
            id: details.title.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30) + `-${Date.now().toString().slice(-4)}`,
            title: details.title, poster: posterLocalPath,
            downloadLink: `https://www.youtube.com/watch?v=${videoDetails.id}`,
            genre: details.genre, category: details.category, releaseDate: publishedAt,
            stars: details.stars, runtime: `${durationMinutes}m`,
            rating: 7.0 + parseFloat((Math.random() * 2).toFixed(1)),
            description: details.description,
            popularity: 70 + Math.floor(Math.random() * 15),
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            seriesTitle: details.seriesTitle,
            partNumber: details.partNumber,
        };
        return newMovie;

    } catch (error) {
        console.error("AI processing or poster download failed:", error);
        return null;
    }
};

const getChannelIdFromUrl = async (channelUrl: string): Promise<string | null> => {
    const handleMatch = channelUrl.match(/youtube\.com\/@([a-zA-Z0-9_-]+)/);
    const idMatch = channelUrl.match(/youtube\.com\/channel\/([a-zA-Z0-9_-]+)/);

    if (idMatch) return idMatch[1];
    if (!handleMatch) return null;

    const handle = handleMatch[1];
    try {
        // Use search endpoint to resolve handle to channel ID
        const response = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${handle}&type=channel&key=${YOUTUBE_API_KEY}`);
        const data = await response.json();
        if (data.items && data.items.length > 0) {
            // Find the exact match for the handle in the search results
            const foundChannel = data.items.find((item: any) => item.snippet.channelTitle.toLowerCase() === handle.toLowerCase() || item.snippet.customUrl === `@${handle}`);
            return foundChannel ? foundChannel.snippet.channelId : data.items[0].snippet.channelId;
        }
        return null;
    } catch (e) {
        console.error("Failed to resolve channel handle:", e);
        return null;
    }
};


const getChannelUploadsPlaylistId = async (channelId: string): Promise<string | null> => {
    try {
        const response = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${YOUTUBE_API_KEY}`);
        const data = await response.json();
        return data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads || null;
    } catch (e) {
        console.error("Failed to get uploads playlist ID:", e);
        return null;
    }
};


export const processNextBatchForChannel = async (channelUrl: string, bot: TelegramBot) => {
    const adminId = process.env.ADMIN_TELEGRAM_USER_ID!;
    console.log(`Processing batch for channel: ${channelUrl}`);
    const BATCH_SIZE = 5;

    try {
        const channelId = await getChannelIdFromUrl(channelUrl);
        if (!channelId) {
            bot.sendMessage(adminId, `❌ Could not resolve channel ID for ${channelUrl}. Skipping.`);
            return;
        }

        const progress = readProgress();
        const channelState = progress[channelId] || { processedVideoIds: [] };

        const uploadsPlaylistId = await getChannelUploadsPlaylistId(channelId);
        if (!uploadsPlaylistId) {
            bot.sendMessage(adminId, `❌ Could not find uploads playlist for ${channelUrl}. Skipping.`);
            return;
        }

        let url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=${BATCH_SIZE}&key=${YOUTUBE_API_KEY}`;
        if (channelState.lastPageToken) {
            url += `&pageToken=${channelState.lastPageToken}`;
        }
        
        const playlistResponse = await fetch(url);
        const playlistData = await playlistResponse.json();

        if (!playlistData.items || playlistData.items.length === 0) {
            bot.sendMessage(adminId, `✅ Finished processing all available videos for channel: ${channelUrl}`);
            channelState.lastPageToken = undefined; // Reset for future checks
            progress[channelId] = channelState;
            writeProgress(progress);
            return;
        }

        const videoIds = playlistData.items.map((item: any) => item.snippet.resourceId.videoId);
        const videoDetails = await fetchYouTubeVideoDetails(videoIds);
        
        let newMoviesAdded = 0;
        const currentMovies = readMovies();

        for (const video of videoDetails || []) {
            if (channelState.processedVideoIds.includes(video.id)) continue;
            
            const durationMinutes = parseDuration(video.contentDetails.duration);
            if (durationMinutes < 15) {
                console.log(`Skipping short video: ${video.snippet.title} (${durationMinutes}m)`);
                channelState.processedVideoIds.push(video.id); // Mark as processed so we don't check again
                continue;
            }

            const newMovie = await createMovieFromYouTube(video);
            if (newMovie) {
                if (currentMovies.some(m => m.title.toLowerCase() === newMovie.title.toLowerCase())) {
                     bot.sendMessage(adminId, `⚠️ Skipped adding "${newMovie.title}" because a movie with that title already exists.`);
                } else {
                    currentMovies.push(newMovie);
                    bot.sendMessage(adminId, `✅ Automatically added: "${newMovie.title}"`);
                    newMoviesAdded++;
                }
            } else {
                 bot.sendMessage(adminId, `❌ AI processing failed for video: ${video.snippet.title}`);
            }
            channelState.processedVideoIds.push(video.id);
        }

        if (newMoviesAdded > 0) {
            writeMovies(currentMovies);
        }

        channelState.lastPageToken = playlistData.nextPageToken;
        progress[channelId] = channelState;
        writeProgress(progress);
        
        const summary = `Batch complete for ${channelUrl}. Added ${newMoviesAdded} new movies. ` + 
                        (playlistData.nextPageToken ? "Will continue on the next run." : "Reached the end of the playlist.");
        bot.sendMessage(adminId, summary);

    } catch (e) {
        console.error(`Error processing channel ${channelUrl}:`, e);
        bot.sendMessage(adminId, `🚨 An error occurred while processing ${channelUrl}.`);
    }
};


// --- EDIT/DELETE FLOWS ---
export const showMoviesForEditing = (bot: TelegramBot, chatId: number, messageId: number) => {
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
