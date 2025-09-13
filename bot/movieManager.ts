// FIX: Declare '__dirname' to resolve TypeScript error about missing Node.js type definitions.
declare const __dirname: string;

import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';
import { Movie } from './types';
import { setUserState, getUserState, clearUserState, atomicWrite } from './utils';
// FIX: The .send() command is not available on the BedrockRuntimeClient in some environments/versions.
// Using invokeModel() directly with the parameters is a reliable alternative.
// Corrected: Import InvokeModelCommand to use the correct AWS SDK v3 client.send() pattern.
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { Buffer } from 'buffer';
import { URL } from 'url';

const MOVIES_PATH = path.join(__dirname, '../../data/movies.json');
const POSTERS_DIR = path.join(__dirname, '../../public/posters');
const PROGRESS_PATH = path.join(__dirname, '../../data/channelProgress.json');

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// Initialize AWS Bedrock client. Assumes ENV VARS are set.
const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
const modelId = 'anthropic.claude-3-7-sonnet-20240715-v1:0';

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

const invokeClaude = async (systemInstruction: string, userPrompt: string, max_tokens: number = 2048): Promise<any> => {
    const payload = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens,
        system: systemInstruction,
        messages: [{ role: 'user', content: userPrompt }],
    };

    // FIX: The .send() command is not available on the BedrockRuntimeClient in some environments/versions.
    // Using invokeModel() directly with the parameters is a reliable alternative.
    // Corrected: Use the client.send(new Command()) pattern for AWS SDK v3.
    const command = new InvokeModelCommand({
        body: JSON.stringify(payload),
        contentType: 'application/json',
        accept: 'application/json',
        modelId,
    });
    const apiResponse = await client.send(command);

    const decodedBody = new TextDecoder().decode(apiResponse.body);
    return JSON.parse(decodedBody);
};

const sanitizeForFilename = (title: string): string => {
    return title
        .toLowerCase()
        .replace(/[\s\W]/g, '-') // Replace whitespace and non-word chars with a hyphen
        .replace(/-+/g, '-')     // Collapse consecutive hyphens
        .replace(/^-|-$/g, '')   // Trim leading/trailing hyphens
        .slice(0, 50);           // Truncate to a reasonable length
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
    { key: 'description', prompt: "Please provide a short description, or type 'AI' to generate one." },
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
            state.movieData.id = sanitizeForFilename(state.movieData.title);
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
                const system = "You are an expert movie summarizer. Based on the title, generate a compelling, single-paragraph movie description of 40-50 words.";
                const prompt = `Yoruba movie title: "${state.movieData.title}"`;
                const response = await invokeClaude(system, prompt);
                const desc = response.content[0].text;
                state.movieData.description = desc;
                bot.sendMessage(userId, `🤖 AI Generated Description:\n\n_"${desc}"_`);
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

const aiEnrichmentSystemInstruction = `You are an expert AI for cataloging Yoruba movies from YouTube data. Your task is to extract, clean, and format movie details precisely.
Analyze the provided YouTube title and description.
The YouTube title often contains junk like "LATEST YORUBA MOVIE 2024". REMOVE this junk. The final title must be the official movie title only.
Respond ONLY with a single, valid JSON object with the following fields:
- "title": The clean, official movie title. If the title indicates it's a sequel (e.g., "Ololade Part 2", "Koleoso 2"), the title MUST include "Part X".
- "seriesTitle": The base name of the movie series. For "Koleoso Part 2", this would be "Koleoso". If it's not a series (e.g., "Anikulapo"), this field must be the same as the "title" field.
- "partNumber": The part number as an integer. If it's the first or only part, this MUST be 1. For "Koleoso Part 2", this MUST be 2.
- "description": A compelling 30-40 word summary of the movie based on the provided description.
- "stars": An array of the top 3-4 main actors mentioned.
- "genre": A single primary genre that best fits the movie (e.g., "Drama", "Action", "Epic", "Thriller").
- "category": Choose the best fit from this exact list: 'Drama', 'Comedy', 'Action', 'Romance', 'Thriller', 'Epic'.`;

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
            const userPrompt = `Enrich this movie data. YouTube Title: "${title}". YouTube Description: "${description}"`;
            
            const responseBody = await invokeClaude(aiEnrichmentSystemInstruction, userPrompt);
            const details = JSON.parse(responseBody.content[0].text);
            const posterPath = await downloadImage(thumbnailUrl, details.title);
            if (!posterPath) throw new Error("Failed to download thumbnail.");

            const movies = readMovies();
            if (movies.find(m => m.title.toLowerCase() === details.title.toLowerCase())) {
                bot.sendMessage(userId, `❌ Error! A movie titled "${details.title}" already exists.`);
                clearUserState(userId);
                return;
            }

            const newMovie: Movie = {
                id: sanitizeForFilename(details.title),
                title: details.title, poster: posterPath,
                downloadLink: url, genre: details.genre,
                category: details.category, releaseDate: publishedAt,
                stars: details.stars, runtime: `${durationMinutes}m`, rating: 7.0,
                description: details.description, popularity: 75,
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
                seriesTitle: details.seriesTitle,
                partNumber: details.partNumber
            };
            
            // NEW: Confirmation Step
            setUserState(userId, { command: 'add_movie_youtube_confirm', movieData: newMovie });
            const caption = `*Confirm Movie Details*\n\n` +
                `*Title:* ${newMovie.title}\n` +
                `*Series:* ${newMovie.seriesTitle} (Part ${newMovie.partNumber})\n` +
                `*Description:* ${newMovie.description}\n` +
                `*Stars:* ${newMovie.stars.join(', ')}\n` +
                `*Genre:* ${newMovie.genre} | *Category:* ${newMovie.category}\n\n` +
                `Do you want to add this movie to the site?`;

            const fullPosterPath = path.join(__dirname, '../../public', posterPath);

            bot.sendPhoto(userId, fullPosterPath, {
                caption: caption,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "✅ Accept", callback_data: "youtube_movie_accept" }, { text: "❌ Reject", callback_data: "youtube_movie_reject" }]
                    ]
                }
            });

        } catch (e) {
            console.error(e);
            bot.sendMessage(userId, "❌ The AI failed to process this URL. Please try a different one or add the movie manually.");
            clearUserState(userId);
        }
    }
};

export const handleYouTubeConfirmation = async (bot: TelegramBot, query: TelegramBot.CallbackQuery) => {
    const userId = query.from.id;
    const state = getUserState(userId);

    if (!state || state.command !== 'add_movie_youtube_confirm') {
        bot.answerCallbackQuery(query.id, { text: "This action has expired." });
        return;
    }

    const { movieData } = state;
    const action = query.data;

    bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
        chat_id: query.message?.chat.id,
        message_id: query.message?.message_id
    });

    if (action === 'youtube_movie_accept') {
        const movies = readMovies();
        movies.push(movieData);
        writeMovies(movies);
        bot.sendMessage(userId, `✅ Success! Movie "${movieData.title}" has been added.`);
    } else { // Reject
        try {
            const posterToDelete = path.join(__dirname, '../../public', movieData.poster);
            if (fs.existsSync(posterToDelete)) {
                fs.unlinkSync(posterToDelete);
            }
        } catch (error) {
            console.error("Could not delete rejected poster:", error);
        }
        bot.sendMessage(userId, `❌ Operation cancelled. The movie "${movieData.title}" has been discarded.`);
    }

    clearUserState(userId);
    bot.answerCallbackQuery(query.id);
};

async function savePoster(bot: TelegramBot, msg: TelegramBot.Message, title: string): Promise<string> {
    const largestPhoto = msg.photo![msg.photo!.length - 1];
    const fileId = largestPhoto.file_id;
    if (!fs.existsSync(POSTERS_DIR)) fs.mkdirSync(POSTERS_DIR, { recursive: true });
    
    const movieId = sanitizeForFilename(title || `movie-${Date.now()}`);
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

        const movieId = sanitizeForFilename(title);
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
        
        const userPrompt = `Enrich this movie data. YouTube Title: "${title}". YouTube Description: "${description}"`;
        
        const responseBody = await invokeClaude(aiEnrichmentSystemInstruction, userPrompt);
        const details = JSON.parse(responseBody.content[0].text);
        const posterLocalPath = await downloadImage(thumbnailUrl, details.title);
        if (!posterLocalPath) return null;
        
        const newMovie: Movie = {
            id: sanitizeForFilename(details.title) + `-${Date.now().toString().slice(-4)}`,
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


// --- INLINE MOVIE SEARCH (NEW) ---
export const handleInlineMovieSearch = async (bot: TelegramBot, query: TelegramBot.InlineQuery) => {
    const searchQuery = query.query.toLowerCase().trim();
    const baseUrl = process.env.WEBSITE_BASE_URL;

    if (!baseUrl) {
        console.warn('⚠️ WEBSITE_BASE_URL environment variable is not set. Inline search poster images will not work.');
    }

    if (!searchQuery) {
        // Answer with an empty array if the query is empty.
        // Telegram will then show the user's history or nothing.
        await bot.answerInlineQuery(query.id, []);
        return;
    }

    const movies = readMovies();
    const results = movies.filter(movie => movie.title.toLowerCase().includes(searchQuery));

    const inlineResults: TelegramBot.InlineQueryResultPhoto[] = results.slice(0, 20).map(movie => {
        const caption = `*${movie.title}*\n\n` +
            `*Description:* ${movie.description.substring(0, 150)}...\n\n` +
            `*Genre:* ${movie.genre} | *Category:* ${movie.category}\n` +
            `*Rating:* ${movie.rating} ⭐ | *Runtime:* ${movie.runtime}\n` +
            `*Stars:* ${movie.stars.join(', ')}`;

        const keyboard = {
            inline_keyboard: [
                [{ text: "✏️ Edit Movie", callback_data: `edit_movie_start_${movie.id}` }, { text: "🗑️ Delete Movie", callback_data: `delete_movie_confirm_${movie.id}` }]
            ]
        };
        
        const posterUrl = movie.poster.startsWith('http') ? movie.poster : `${baseUrl || ''}${movie.poster}`;

        return {
            type: 'photo',
            id: movie.id,
            photo_url: posterUrl,
            thumb_url: posterUrl,
            caption: caption,
            parse_mode: 'Markdown',
            reply_markup: keyboard,
        };
    });

    await bot.answerInlineQuery(query.id, inlineResults, {
        cache_time: 10 // Cache results for 10 seconds
    });
};


// --- EDIT FLOWS (NEW) ---

async function displayEditMenu(bot: TelegramBot, chatId: number, messageId: number | undefined, movieId: string) {
    const movies = readMovies();
    const movie = movies.find(m => m.id === movieId);

    if (!movie) {
        bot.editMessageText("Error: Movie not found.", { chat_id: chatId, message_id: messageId! });
        return;
    }

    // Delete the previous menu if possible to avoid clutter
    if (messageId) {
        try { await bot.deleteMessage(chatId, messageId); }
        catch (e) { /* ignore if message doesn't exist */ }
    }

    const caption = `*Editing: ${movie.title}*\n\n` +
        `*ID:* \`${movie.id}\`\n` +
        `*Description:* ${movie.description.substring(0, 100)}...\n` +
        `*Genre:* ${movie.genre}\n` +
        `*Category:* ${movie.category}\n` +
        `*Stars:* ${movie.stars.join(', ')}\n` +
        `*Rating:* ${movie.rating}\n\n` +
        `Select a field to edit:`;

    const posterPath = path.join(__dirname, '../../public', movie.poster);
    
    const keyboard = {
        inline_keyboard: [
            [{ text: "✏️ Title", callback_data: `edit_movie_field_title_${movieId}` }, { text: "✏️ Description", callback_data: `edit_movie_field_description_${movieId}` }],
            [{ text: "✏️ Genre", callback_data: `edit_movie_field_genre_${movieId}` }, { text: "✏️ Category", callback_data: `edit_movie_field_category_${movieId}` }],
            [{ text: "✏️ Stars", callback_data: `edit_movie_field_stars_${movieId}` }, { text: "✏️ Rating", callback_data: `edit_movie_field_rating_${movieId}` }],
            [{ text: "🖼️ Poster", callback_data: `edit_movie_field_poster_${movieId}` }],
            [{ text: "⬅️ Back to Movie List", callback_data: "edit_movie_list" }]
        ]
    };

    if (fs.existsSync(posterPath)) {
        await bot.sendPhoto(chatId, posterPath, {
            caption: caption,
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    } else {
        // Fallback if poster file not found
        await bot.sendMessage(chatId, caption, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }
    // Clear any leftover state after showing the menu
    clearUserState(chatId);
}

async function promptForEditField(bot: TelegramBot, query: TelegramBot.CallbackQuery) {
    if (!query.data || !query.message) return;
    const parts = query.data.split('_');
    const field = parts[3];
    const movieId = parts.slice(4).join('_'); // Handle IDs with underscores
    const userId = query.from.id;

    setUserState(userId, { command: 'editing_movie_value', movieId, field });

    let promptText = `Please enter the new value for *${field}*.`;
    if (field === 'poster') {
        promptText = `Please send the new poster image for the movie.`;
    } else if (field === 'stars') {
        promptText = `Please enter the new stars, separated by commas.`;
    }
    
    await bot.sendMessage(query.message.chat.id, promptText, { parse_mode: 'Markdown' });
}


export const showMoviesForEditing = (bot: TelegramBot, chatId: number, messageId: number) => {
    const movies = readMovies();
    if (movies.length === 0) {
        bot.editMessageText("There are no movies to edit.", { chat_id: chatId, message_id: messageId });
        return;
    }
    const keyboard = movies.map(movie => ([{ text: movie.title, callback_data: `edit_movie_start_${movie.id}` }]));
    keyboard.push([{ text: "⬅️ Back", callback_data: 'manage_movies' }]);

    bot.editMessageText("✏️ Select a movie to edit:", {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
            inline_keyboard: keyboard
        }
    });
};

export const handleEditMovieCallback = async (bot: TelegramBot, query: TelegramBot.CallbackQuery) => {
    const data = query.data;
    if (!data || !query.message) return;

    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    if (data.startsWith('edit_movie_start_')) {
        const movieId = data.replace('edit_movie_start_', '');
        await displayEditMenu(bot, chatId, messageId, movieId);
    } else if (data.startsWith('edit_movie_field_')) {
        await promptForEditField(bot, query);
    }
};

export async function handleEditMovieResponse(bot: TelegramBot, msg: TelegramBot.Message) {
    const userId = msg.from?.id;
    if (!userId) return;

    const state = getUserState(userId);
    if (!state || state.command !== 'editing_movie_value') return;

    const { movieId, field } = state;
    const movies = readMovies();
    const movieIndex = movies.findIndex(m => m.id === movieId);

    if (movieIndex === -1) {
        bot.sendMessage(userId, "Error: Could not find the movie to update.");
        clearUserState(userId);
        return;
    }
    const movieToUpdate = movies[movieIndex];
    let updateSuccess = false;

    if (field === 'poster') {
        if (msg.photo) {
            try {
                if (movieToUpdate.poster.startsWith('/posters/')) {
                    const oldPosterPath = path.join(__dirname, '../../public', movieToUpdate.poster);
                    if (fs.existsSync(oldPosterPath)) fs.unlinkSync(oldPosterPath);
                }
            } catch (err) { console.error(`Could not delete old poster:`, err); }
            
            const newPosterPath = await savePoster(bot, msg, movieToUpdate.title);
            movies[movieIndex].poster = newPosterPath;
            updateSuccess = true;
        } else {
            bot.sendMessage(userId, "That's not an image. Please send a photo for the poster.");
            return;
        }
    } else {
        if (msg.text) {
            let newValue: any = msg.text;
            if (field === 'rating') {
                newValue = parseFloat(newValue);
                if (isNaN(newValue)) {
                    bot.sendMessage(userId, "Invalid rating. Please enter a number.");
                    return;
                }
            } else if (field === 'stars') {
                newValue = newValue.split(',').map(s => s.trim());
            } else if (field === 'partNumber') {
                newValue = parseInt(newValue, 10);
                if (isNaN(newValue)) {
                    bot.sendMessage(userId, "Invalid part number. Please enter a number.");
                    return;
                }
            }
            (movies[movieIndex] as any)[field] = newValue;
            updateSuccess = true;
        } else {
            bot.sendMessage(userId, "Invalid input. Please provide the requested information.");
            return;
        }
    }

    if (updateSuccess) {
        movies[movieIndex].updatedAt = new Date().toISOString();
        writeMovies(movies);
        await bot.sendMessage(userId, `✅ Success! The *${field}* has been updated.`, { parse_mode: 'Markdown' });
        
        clearUserState(userId);
        await displayEditMenu(bot, userId, undefined, movieId);
    }
}


// --- DELETE FLOWS ---
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