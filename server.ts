// FIX: Changed import style to use `express.Request` and `express.Response` to resolve type conflicts.
import express, { Request, Response } from 'express';
import path from 'path';
import { runBot } from './bot/run';
import { GoogleGenAI } from "@google/genai";
import usersRouter from './api/users';
import commentsRouter from './api/comments';

// --- SERVER SETUP ---
const app = express();
// FIX: Explicitly parse the port to a number to satisfy the listen() function's type requirement.
const PORT = parseInt(process.env.PORT || '3000', 10);

// @FIX: The type errors in route handlers were causing this `app.use` call to fail type checking. Fixing the handlers resolves this.
app.use(express.json({ limit: '10mb' })); // Increase limit for profile pics

// --- SECURITY & HELPERS ---
const userRequests = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;

const checkRateLimit = (userId: string) => {
    const now = Date.now();
    const timestamps = userRequests.get(userId) || [];
    const recentTimestamps = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    if (recentTimestamps.length >= MAX_REQUESTS_PER_WINDOW) return { limited: true };
    recentTimestamps.push(now);
    userRequests.set(userId, recentTimestamps);
    return { limited: false };
};

const validateSession = (session: any) => {
    return session && typeof session.userId === 'string' && typeof session.expires === 'number' && session.expires > Date.now();
};

// --- API ROUTES (MIGRATED FROM /api) ---

// Gemini AI Proxy
// FIX: Explicitly type req and res to fix errors on `res.status` and `req.body`.
// @FIX: Use express.Request and express.Response for proper type inference.
app.post('/api/gemini', async (req: express.Request, res: express.Response) => {
    if (!process.env.API_KEY) {
        return res.status(500).json({ error: 'API key not configured on the server.' });
    }
    try {
        const { endpoint, params, session } = req.body;
        if (!validateSession(session)) {
            return res.status(401).json({ error: 'Unauthorized: Invalid session.' });
        }
        if (checkRateLimit(session.userId).limited) {
            return res.status(429).json({ error: 'Too Many Requests.' });
        }
        
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        if (endpoint === 'generateContent') {
            const result = await ai.models.generateContent(params);
            res.status(200).json(result);
        } else {
            res.status(400).json({ error: `Unknown endpoint: ${endpoint}` });
        }
    } catch (error) {
        console.error('Error in Gemini proxy:', error);
        res.status(500).json({ error: 'Internal AI error.' });
    }
});

// YouTube Downloader Proxy
// FIX: Explicitly type req and res.
// @FIX: Use express.Request and express.Response for proper type inference.
app.post('/api/youtube-downloader', async (req: express.Request, res: express.Response) => {
    const DOWNLOADER_API_ENDPOINT = 'https://co.wuk.sh/api/json';
    try {
        const { url, session } = req.body;
        if (!validateSession(session)) {
            return res.status(401).json({ error: 'Unauthorized: You must be logged in to use this feature.' });
        }
        if (checkRateLimit(session.userId).limited) {
            return res.status(429).json({ error: 'Too Many Requests.' });
        }
        if (!url || !/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url)) {
            return res.status(400).json({ error: 'Invalid YouTube URL.' });
        }
        const serviceResponse = await fetch(DOWNLOADER_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, isNoTTWatermark: true, isAudioOnly: false })
        });
        const data = await serviceResponse.json();
        res.status(serviceResponse.status).json(data);
    } catch (error) {
        console.error('Error in YouTube Downloader proxy:', error);
        res.status(500).json({ error: 'Internal downloader error.' });
    }
});

// Users API (logic from api/users.ts)
// FIX: Explicitly typing handlers resolves incorrect overload selection for `app.use`.
app.use('/api/users', usersRouter);

// Comments API (logic from api/comments.ts)
// FIX: Explicitly typing handlers resolves incorrect overload selection for `app.use`.
app.use('/api/comments', commentsRouter);


// --- STATIC FILE SERVING ---
app.use(express.static(path.join(__dirname, '../public')));
app.use('/data', express.static(path.join(__dirname, '../data')));

// Serve the main app for any other route
// FIX: Explicitly type req and res.
// @FIX: Use express.Request and express.Response for proper type inference.
app.get('*', (req: express.Request, res: express.Response) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// --- STARTUP ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Web server listening on port ${PORT}. Accessible on all network interfaces.`);
    
    // Start the Telegram bot
    try {
        runBot();
    } catch (error) {
        console.error("❌ Failed to start Telegram bot:", error);
    }
});