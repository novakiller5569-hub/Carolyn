
import fs from 'fs';
import path from 'path';

const LOG_PATH = path.join(__dirname, '../../data/analyticsLog.json');

type LogEntry = {
    type: 'VISIT' | 'SIGNUP' | 'MOVIE_CLICK';
    timestamp: string;
    payload?: {
        movieId?: string;
        movieTitle?: string;
    };
};

const readLog = (): LogEntry[] => {
    try {
        if (!fs.existsSync(LOG_PATH)) return [];
        const data = fs.readFileSync(LOG_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Error reading analyticsLog.json:", error);
        return [];
    }
};

const writeLog = (log: LogEntry[]) => {
    fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2), 'utf-8');
};

// --- "REAL" DATA SIMULATION ---
// In a real app, these would be called from the frontend API.
// Here we simulate them being called periodically.
const logEvent = (entry: Omit<LogEntry, 'timestamp'>) => {
    const log = readLog();
    const newEntry: LogEntry = { ...entry, timestamp: new Date().toISOString() };
    log.push(newEntry);
    // Keep the log from getting too large
    if (log.length > 5000) {
        log.shift();
    }
    writeLog(log);
};

// Simulate some traffic for demonstration
setInterval(() => {
    logEvent({ type: 'VISIT' });
    if (Math.random() < 0.05) {
        logEvent({ type: 'SIGNUP' });
    }
}, 30 * 60 * 1000); // Simulate a visit every 30 minutes

// Public function to be called from other parts of a REAL app
export const logMovieClick = (movieId: string, movieTitle: string) => {
    logEvent({ type: 'MOVIE_CLICK', payload: { movieId, movieTitle } });
};


// --- ANALYTICS DATA RETRIEVAL ---

export const getAnalyticsSummary = (timeframeDays: number = 1) => {
    const log = readLog();
    const now = new Date();
    const cutoff = new Date(now.getTime() - timeframeDays * 24 * 60 * 60 * 1000);

    const recentLogs = log.filter(entry => new Date(entry.timestamp) > cutoff);

    const dailyVisitors = recentLogs.filter(e => e.type === 'VISIT').length;
    const todaysSignups = recentLogs.filter(e => e.type === 'SIGNUP').length;
    
    const movieClicks = new Map<string, number>();
    recentLogs.forEach(entry => {
        if (entry.type === 'MOVIE_CLICK' && entry.payload?.movieTitle) {
            const title = entry.payload.movieTitle;
            movieClicks.set(title, (movieClicks.get(title) || 0) + 1);
        }
    });

    const mostClicked = Array.from(movieClicks.entries())
        .map(([title, clicks]) => ({ title, clicks }))
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 5);

    return {
        dailyVisitors,
        todaysSignups,
        mostClicked,
        totalEvents: recentLogs.length
    };
};
