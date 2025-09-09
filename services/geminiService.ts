
import { GoogleGenAI, Type } from "@google/genai";
import { MOVIES } from '../constants';
import { Movie } from "../types";

// Ensure the API key is available, but do not expose it in the UI or ask the user for it.
// It is assumed to be set in the environment.
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.warn("API_KEY environment variable not set for Gemini. AI features will be disabled.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY! });

const model = 'gemini-2.5-flash';

export interface AiChatResponse {
  text: string;
  movie?: Movie;
}

export const runChat = async (prompt: string): Promise<AiChatResponse> => {
  if (!API_KEY) {
    return { text: "I'm sorry, but the AI service is currently unavailable. Please check the configuration." };
  }

  try {
    const movieContext = MOVIES.map(movie => {
        return `ID: ${movie.id}, Title: ${movie.title}, Genre: ${movie.genre}, Category: ${movie.category}, Stars: ${movie.stars.join(', ')}, Description: ${movie.description}`;
    }).join('\n---\n');

    const systemInstruction = `You are a smart and helpful AI assistant for "Yoruba Cinemax", a Yoruba movie streaming website. Your sole purpose is to help users find movies available on this platform. You must communicate ONLY in English and respond in JSON format.

If you find a single, specific movie that is a great match for the user's request, include its unique ID in the "movieId" field of your JSON response. If the user's query is broad or doesn't match a specific movie, you MUST set "movieId" to null. Always provide a conversational text response.

Your knowledge is strictly limited to this list of available movies:
---
${movieContext}
---

Example user query: "Show me a movie about a mystical bird"
Example response:
{
  "text": "I think you'll love Aníkúlápó! It's a fantastic fantasy epic about a traveler and a mystical bird.",
  "movieId": "anikalupo"
}

Example user query: "Any good action movies?"
Example response:
{
  "text": "We have some great action movies! Have you seen Jagun Jagun or King of Thieves? They are both highly rated epics.",
  "movieId": null
}`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        text: { type: Type.STRING, description: "Your friendly, conversational response to the user." },
        movieId: { type: Type.STRING, description: "The ID of a specific movie if it's a direct match, otherwise null." },
      },
      required: ['text', 'movieId'],
    };

    const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: {
            systemInstruction: systemInstruction,
            responseMimeType: "application/json",
            responseSchema,
            temperature: 0.7,
        }
    });
    
    const jsonString = response.text.trim();
    if (!jsonString.startsWith('{') || !jsonString.endsWith('}')) {
        console.error("Gemini did not return valid JSON:", jsonString);
        return { text: jsonString || "I had a small issue processing that. Could you try again?" };
    }
    const aiResponseData = JSON.parse(jsonString);

    const result: AiChatResponse = {
        text: aiResponseData.text,
    };

    if (aiResponseData.movieId) {
        const movie = MOVIES.find(m => m.id === aiResponseData.movieId);
        if (movie) {
            result.movie = movie;
        }
    }

    return result;

  } catch (error) {
    console.error(`[Gemini Service Error]`, error);
    return { text: "I'm having a bit of trouble thinking right now. Please try asking me again in a moment." };
  }
};

export const findMovieByDescription = async (query: string): Promise<Movie | null> => {
    if (!API_KEY) return null;
    try {
        const movieContext = MOVIES.map(m => `ID: ${m.id}, Title: ${m.title}, Description: ${m.description}, Stars: ${m.stars.join(', ')}`).join('\n');
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
            }
        });

        const jsonString = response.text.trim();
        const parsed = JSON.parse(jsonString);
        
        if (parsed.movieId) {
            return MOVIES.find(m => m.id === parsed.movieId) || null;
        }
        return null;

    } catch (error) {
        console.error("[findMovieByDescription Error]", error);
        return null;
    }
};

export const getAiRecommendations = async (currentMovie: Movie): Promise<{ movieId: string, reason: string }[] | null> => {
    if (!API_KEY) return null;
    try {
        const otherMoviesContext = MOVIES
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