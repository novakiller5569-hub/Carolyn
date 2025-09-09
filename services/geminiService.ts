
import { GoogleGenAI, Type, Chat } from "@google/genai";
import { Movie, User, SiteConfig } from "./types";
import { getViewingHistory } from "./storageService";
import { getAnalyticsSummary } from "./analyticsService";


// Use the hardcoded Gemini API key provided by the user.
const API_KEY = "AIzaSyB12BsvYrfH536bmxTj7Rdj3fY_ScjKecQ";

// Initialize the AI client.
const ai = new GoogleGenAI({ apiKey: API_KEY });

const model = 'gemini-2.5-flash';

// This will hold our chat session instance to maintain conversation history
let chat: Chat | null = null;
let lastSystemInstruction = '';

const getSystemInstruction = (movies: Movie[], siteConfig: SiteConfig, isAdmin: boolean) => {
    const movieContext = movies.map(movie => {
        return `ID: ${movie.id}, Title: ${movie.title}, Genre: ${movie.genre}, Category: ${movie.category}, Description: ${movie.description}`;
    }).join('\n');

    let instruction = `You are a smart and helpful AI assistant for "${siteConfig.name}", a Yoruba movie streaming website. Your primary goal is to help users.

- The website's URL structure for a movie is /#/movie/{id}. When a user asks for a movie that is available, you MUST provide them with the direct link. For example, a link to Jagun Jagun (ID: jagun-jagun) would be /#/movie/jagun-jagun.
- The Live TV page is currently ${siteConfig.liveTvEnabled ? 'online. You can direct users to /#/live-tv.' : 'offline. Inform users it is not available right now.'}
- For questions about movies available on our platform, answer them using the provided list. When you mention one of these movies, clearly state that it is available on ${siteConfig.name}.
- When asked for recommendations or a list of movies (e.g., "list all action movies"), suggest movies from the provided list.
- For any other questions about movies, actors, release dates, or general cinema knowledge, use your ability to search the internet to provide accurate, up-to-date information.
- When you find a movie on the internet that is NOT in our platform's list, be clear that it is not currently available on ${siteConfig.name}.
- If the user asks for a movie that is NOT on the platform list, first search the web. If you find details, tell the user about the movie and ask "Would you like me to open a request form to send to the admin?" If the user says yes, or if you cannot find any details online, respond with: "I couldn't find that in our library, but I can help you request it. Please fill out the form below." followed immediately by the special command [SHOW_MOVIE_REQUEST_FORM].
- If a user submits a movie request form with details (e.g., starting with "User has submitted a movie request form..."), your ONLY job is to respond with a confirmation message and a pre-filled email link for them to send. The email link MUST be a markdown mailto link. The recipient is ${siteConfig.contact.email}. The subject should be "New Movie Request: [Movie Title]". The body should contain all the details provided by the user. Example response: "Thanks! I've prepared the request. Please click the link to send it to our team: [Send Movie Request](mailto:${siteConfig.contact.email}?subject=New%20Movie%20Request&body=...)"
- Always be friendly and conversational. Do not output JSON.`;
    
    if (isAdmin) {
        let days = 1; // Default to today
        const analytics = getAnalyticsSummary(days);
        instruction += `\n
---
**ADMINISTRATOR MODE ENABLED**
You are also an admin assistant. If asked about site performance or analytics, use the following real-time data to answer. Be concise and clear.

**Live Analytics Data (Last 24 hours):**
- Total Site Visits: ${analytics.dailyVisitors}
- New User Sign-ups: ${analytics.todaysSignups}
- Most Popular Movies (by page views):
  ${analytics.mostClicked.map((m, i) => `${i + 1}. ${m.title} (${m.clicks} views)`).join('\n') || 'No movie pages were viewed.'}
---`;
    } else {
        instruction += `\n
- **IMPORTANT RULE:** You are speaking to a regular user, NOT an admin. You MUST politely refuse any requests for site analytics, visitor counts, or performance metrics. Do not reveal any numbers or statistics.`;
    }


    instruction += `\nHere is the list of movies currently available on Yoruba Cinemax:
---
${movieContext}
---`;

    return instruction;
}


export interface AiChatResponse {
  text: string;
  movie?: Movie;
  sources?: { uri: string; title: string; }[];
}

export const runChat = async (prompt: string, movies: Movie[], siteConfig: SiteConfig, isAdmin: boolean = false): Promise<AiChatResponse> => {
   if (!movies || movies.length === 0) {
    return { text: "I'm still loading our movie catalog. Please ask me again in a moment!" };
  }

  try {
    const newSystemInstruction = getSystemInstruction(movies, siteConfig, isAdmin);
    // Initialize or re-initialize chat session if system instruction changes (e.g., movies list updated or admin status changes)
    if (!chat || newSystemInstruction !== lastSystemInstruction) {
        lastSystemInstruction = newSystemInstruction;
        chat = ai.chats.create({
            model: model,
            config: {
                systemInstruction: newSystemInstruction,
                temperature: 0.7,
                tools: [{googleSearch: {}}]
            }
        });
    }

    const response = await chat.sendMessage({ message: prompt });
    
    const aiText = response.text;
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;

    // Extract web sources from grounding chunks
    const sources = groundingMetadata?.groundingChunks
        ?.map(chunk => chunk.web)
        .filter((web): web is { uri: string; title: string; } => !!web?.uri && !!web.title) || [];

    // Attempt to find a movie from our list mentioned in the response
    let foundMovie: Movie | undefined = undefined;
    for (const movie of movies) {
      // Use a regex to avoid matching substrings in other words
      const movieTitleRegex = new RegExp(`\\b${movie.title.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
      if (movieTitleRegex.test(aiText)) {
        foundMovie = movie;
        break; // Stop at the first match
      }
    }

    const result: AiChatResponse = {
        text: aiText,
        movie: foundMovie,
        sources: sources.length > 0 ? sources : undefined,
    };

    return result;

  } catch (error) {
    console.error(`[Gemini Service Error]`, error);
    return { text: "I'm having a bit of trouble thinking right now. Please try asking me again in a moment." };
  }
};

export const findMovieByDescription = async (query: string, movies: Movie[]): Promise<Movie | null> => {
    try {
        const movieContext = movies.map(m => `ID: ${m.id}, Title: ${m.title}, Description: ${m.description}, Stars: ${m.stars.join(', ')}`).join('\n');
        const systemInstruction = `You are an expert movie finder for a Yoruba movie website. Your task is to find the single best movie match from the provided list based on the user's description. Respond only with the movie's unique ID in JSON format. If no clear match is found, the ID should be null.

Movie List:
${movieContext}

Example query: "the one about the warrior school"
Example response: { "movieId": "jagun-jagun" }`;

        const responseSchema = {
            type: Type.OBJECT,
            properties: {
                movieId: { type: Type.STRING, description: "The ID of the best matching movie, or null." },
            },
            required: ['movieId'],
        };
        
        const response = await ai.models.generateContent({
            model: model,
            contents: query,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema,
                thinkingConfig: { thinkingBudget: 0 },
            }
        });

        const jsonString = response.text.trim();
        const parsed = JSON.parse(jsonString);
        
        if (parsed.movieId) {
            return movies.find(m => m.id === parsed.movieId) || null;
        }
        return null;

    } catch (error) {
        console.error("[findMovieByDescription Error]", error);
        return null;
    }
};

export const getAiRecommendations = async (currentMovie: Movie, movies: Movie[]): Promise<{ movieId: string, reason: string }[] | null> => {
    try {
        const otherMoviesContext = movies
            .filter(m => m.id !== currentMovie.id)
            .map(m => `ID: ${m.id}, Title: ${m.title}, Genre: ${m.genre}, Category: ${m.category}, Description: ${m.description}`)
            .join('\n');

        const systemInstruction = `You are a movie recommendation expert for Yoruba Cinemax. Based on the movie the user is currently viewing, recommend 3 other relevant movies from the provided list. For each recommendation, provide a short, compelling reason (max 20 words) why they would enjoy it. Respond in JSON format.

Current Movie:
Title: ${currentMovie.title}
Description: ${currentMovie.description}

Available Movies for Recommendation:
${otherMoviesContext}`;

        const responseSchema = {
            type: Type.OBJECT,
            properties: {
                recommendations: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            movieId: { type: Type.STRING },
                            reason: { type: Type.STRING }
                        },
                        required: ['movieId', 'reason']
                    }
                }
            },
            required: ['recommendations'],
        };

        const response = await ai.models.generateContent({
            model: model,
            contents: `Please give me 3 recommendations based on ${currentMovie.title}.`,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema,
                thinkingConfig: { thinkingBudget: 0 },
            }
        });

        const jsonString = response.text.trim();
        const parsed = JSON.parse(jsonString);
        return parsed.recommendations || null;

    } catch (error) {
        console.error("[getAiRecommendations Error]", error);
        return null;
    }
};

export const getAiPersonalizedRecommendations = async (viewingHistory: {movieId: string, viewedAt: string}[], movies: Movie[]): Promise<{ movieId: string }[] | null> => {
    if (viewingHistory.length === 0) return null;
    try {
        const historyMovies = viewingHistory.map(h => movies.find(m => m.id === h.movieId)).filter(Boolean);
        if (historyMovies.length === 0) return null;

        const historyContext = historyMovies.map(m => `Title: ${m!.title}, Genre: ${m!.genre}, Description: ${m!.description}`).join('\n');
        const availableMoviesContext = movies
            .filter(m => !viewingHistory.some(h => h.movieId === m.id))
            .map(m => `ID: ${m.id}, Title: ${m.title}, Genre: ${m.genre}, Category: ${m.category}`)
            .join('\n');
        
        if (!availableMoviesContext) return null; // No movies left to recommend

        const systemInstruction = `You are a personalized movie recommendation engine for Yoruba Cinemax. Based on the user's viewing history, recommend 5 movies from the "Available Movies" list that they would likely enjoy. Only respond with a JSON object containing a list of movie IDs.

User's Viewing History:
${historyContext}

Available Movies for Recommendation:
${availableMoviesContext}`;

        const responseSchema = {
            type: Type.OBJECT,
            properties: {
                recommendations: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            movieId: { type: Type.STRING }
                        },
                        required: ['movieId']
                    }
                }
            },
            required: ['recommendations'],
        };

        const response = await ai.models.generateContent({
            model: model,
            contents: `Give me 5 personalized recommendations.`,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema,
                thinkingConfig: { thinkingBudget: 0 },
            }
        });

        const jsonString = response.text.trim();
        const parsed = JSON.parse(jsonString);
        return parsed.recommendations || null;

    } catch (error) {
        console.error("[getAiPersonalizedRecommendations Error]", error);
        return null;
    }
};