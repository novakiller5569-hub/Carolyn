import { GoogleGenAI } from "@google/genai";
import { validateSession } from "./auth";
import { checkRateLimit } from "./rateLimiter";

/**
 * This file acts as a secure backend proxy for all Gemini API calls.
 * It is intended to be deployed as a serverless function (e.g., on Vercel, Netlify, or Google Cloud).
 * The frontend will send requests to this endpoint ('/api/gemini') instead of calling Google directly.
 * This function then securely attaches the API_KEY (stored as a server-side environment variable)
 * and forwards the request to the Gemini API.
 *
 * This is the industry-standard best practice for protecting API keys.
 */

// A generic handler that can be adapted to any serverless environment.
// It expects a request object with a .json() method and returns a response-like object.
export default async function handler(request: { json: () => Promise<any> }) {
  // 1. Security Check: Ensure the API key is configured on the server.
  if (!process.env.API_KEY) {
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'API key not configured on the server.' })
    };
  }
  
  try {
    const { endpoint, params, session } = await request.json();

    // 2. Authentication: Validate the user's session token.
    if (!validateSession(session)) {
      return {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Unauthorized: Invalid or missing session token.' })
      };
    }

    // 3. Rate Limiting: Prevent abuse from a single user.
    const { limited, retryAfter } = checkRateLimit(session.userId);
    if (limited) {
      return {
        status: 429,
        headers: { 
          'Content-Type': 'application/json',
          'Retry-After': retryAfter?.toString() || '60'
        },
        body: JSON.stringify({ error: 'Too Many Requests. Please try again later.' })
      };
    }

    // 4. Initialize the Gemini client securely on the server-side.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    let result;

    // 5. Route the request to the appropriate Gemini SDK method.
    // This switch can be expanded to support other Gemini features (e.g., streaming, image generation).
    switch (endpoint) {
      case 'generateContent':
        result = await ai.models.generateContent(params);
        break;
      default:
         return {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: `Unknown endpoint: ${endpoint}` })
        };
    }

    // 6. Return the successful response from Gemini back to the frontend.
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    };

  } catch (error) {
    // 7. Handle any other errors gracefully.
    console.error('Error in Gemini proxy function:', error);
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'An internal error occurred while processing the AI request.' })
    };
  }
}