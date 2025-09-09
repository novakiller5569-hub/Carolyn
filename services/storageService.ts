import { User, Comment, Upvote } from './types';

/**
 * NOTE: This is a client-side storage solution using localStorage for demonstration purposes.
 * It simulates a backend database. In a production application, all of this data
 * (users, comments, etc.) would be stored securely on a server and accessed via an API.
 * Storing sensitive information like user data directly in localStorage is not secure.
 */

// --- CACHING LAYER ---
// In-memory cache to reduce redundant reads and parsing from localStorage.
const cache = {
    users: null as User[] | null,
    comments: null as Record<string, Comment[]> | null,
    upvotes: null as Record<string, string[]> | null,
    watchlists: null as Record<string, string[]> | null,
    histories: null as Record<string, { movieId: string, viewedAt: string }[]> | null,
};


// --- UTILITY FUNCTIONS ---
const getItem = <T>(key: string, defaultValue: T): T => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.error(`Error reading from localStorage key “${key}”:`, error);
    return defaultValue;
  }
};

const setItem = <T>(key: string, value: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Error writing to localStorage key “${key}”:`, error);
  }
};

// --- INITIAL DATA SEEDING ---
const initializeData = () => {
    if(!localStorage.getItem('YC_INITIALIZED_V2')) {
        localStorage.removeItem('YC_COMMENTS');
        localStorage.setItem('YC_INITIALIZED_V2', 'true');
    }

    // Seed the admin user if it doesn't exist.
    const seedAdminUser = () => {
        const adminEmail = 'ayeyemiademola5569@gmail.com';
        const users = getUsers();
        if (!users.some(u => u.email === adminEmail)) {
            addUser({
                name: 'Ademola Ayeyemi', // Admin's display name
                email: adminEmail,
                passwordHash: 'Ademola5569'
            });
            console.log('Admin user seeded successfully.');
        }
    };
    seedAdminUser();
};

// --- USER MANAGEMENT ---
export const getUsers = (): User[] => {
    if (cache.users) return cache.users;
    const users = getItem<User[]>('YC_USERS', []);
    cache.users = users;
    return users;
}
export const saveUsers = (users: User[]): void => {
    setItem('YC_USERS', users);
    cache.users = null; // Invalidate cache
};

export const addUser = (userData: Omit<User, 'id'>): User => {
    const users = getUsers();
    const newUser: User = { ...userData, id: `user_${new Date().getTime()}` };
    saveUsers([...users, newUser]);
    return newUser;
};

export const getUserByEmail = (email: string): User | undefined => {
    return getUsers().find(user => user.email.toLowerCase() === email.toLowerCase());
};
export const getUserById = (id: string): User | undefined => {
    return getUsers().find(user => user.id === id);
};

export const authenticateUser = (email: string, password: string): User | null => {
    const user = getUserByEmail(email);
    // NOTE: This is a plain text password comparison. NEVER do this in production.
    // Always hash passwords on a server.
    if (user && user.passwordHash === password) {
        return user;
    }
    return null;
};

// --- SESSION MANAGEMENT ---
const SESSION_DURATION = 3 * 24 * 60 * 60 * 1000; // 3 days

export const createSession = (userId: string): void => {
    const expires = Date.now() + SESSION_DURATION;
    setItem('YC_SESSION', { userId, expires });
};

export const getSession = (): { userId: string; expires: number } | null => {
    const session = getItem<{ userId: string; expires: number } | null>('YC_SESSION', null);
    if (session && session.expires > Date.now()) {
        return session;
    }
    clearSession();
    return null;
};

export const clearSession = (): void => localStorage.removeItem('YC_SESSION');


// --- COMMENTS & UPVOTES ---
const getAllComments = (): Record<string, Comment[]> => {
    if (cache.comments) return cache.comments;
    const comments = getItem('YC_COMMENTS', {});
    cache.comments = comments;
    return comments;
}
const saveAllComments = (allComments: Record<string, Comment[]>): void => {
    setItem('YC_COMMENTS', allComments);
    cache.comments = null; // Invalidate cache
}

export const getComments = (movieId: string): Comment[] => {
    const allComments = getAllComments();
    return allComments[movieId] || [];
};

export const addComment = (movieId: string, commentData: Omit<Comment, 'id' | 'replies'>): void => {
    const allComments = getAllComments();
    const movieComments = allComments[movieId] || [];
    const newComment: Comment = {
        ...commentData,
        id: `comment_${new Date().getTime()}`,
        replies: [],
    };
    allComments[movieId] = [...movieComments, newComment];
    saveAllComments(allComments);
};

export const deleteComment = (movieId: string, commentId: string): void => {
    const allComments = getAllComments();
    let movieComments = allComments[movieId] || [];
    if (!movieComments.length) return;

    const commentsToDelete = new Set<string>([commentId]);
    let changed = true;
    
    // Iteratively find all replies of replies to ensure the entire thread is deleted.
    while (changed) {
        changed = false;
        const currentSize = commentsToDelete.size;
        movieComments.forEach(comment => {
            if (comment.parentId && commentsToDelete.has(comment.parentId)) {
                commentsToDelete.add(comment.id);
            }
        });
        if (commentsToDelete.size > currentSize) {
            changed = true;
        }
    }
    
    const newComments = movieComments.filter(comment => !commentsToDelete.has(comment.id));
    
    if (newComments.length < movieComments.length) {
        allComments[movieId] = newComments;
        saveAllComments(allComments);
    }
};


export const nestComments = (comments: Comment[]): Comment[] => {
    const commentMap = new Map<string, Comment>();
    const rootComments: Comment[] = [];
    
    comments.forEach(c => {
        c.replies = []; // Reset replies before nesting
        commentMap.set(c.id, c);
    });

    comments.forEach(c => {
        if (c.parentId && commentMap.has(c.parentId)) {
            commentMap.get(c.parentId)!.replies.push(c);
        } else {
            rootComments.push(c);
        }
    });

    return rootComments.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

const getAllUpvotes = (): Record<string, string[]> => {
    if (cache.upvotes) return cache.upvotes;
    const upvotes = getItem('YC_UPVOTES', {});
    cache.upvotes = upvotes;
    return upvotes;
}
const saveAllUpvotes = (allUpvotes: Record<string, string[]>): void => {
    setItem('YC_UPVOTES', allUpvotes);
    cache.upvotes = null; // Invalidate cache
}

export const getUpvotes = (commentId: string): string[] => {
    return getAllUpvotes()[commentId] || [];
};

export const toggleUpvote = (commentId: string, userId: string): void => {
    const allUpvotes = getAllUpvotes();
    let commentUpvotes = allUpvotes[commentId] || [];
    
    if(commentUpvotes.includes(userId)) {
        commentUpvotes = commentUpvotes.filter(id => id !== userId);
    } else {
        commentUpvotes.push(userId);
    }
    
    allUpvotes[commentId] = commentUpvotes;
    saveAllUpvotes(allUpvotes);
};


// --- WATCHLIST ---
const getWatchlists = (): Record<string, string[]> => {
    if (cache.watchlists) return cache.watchlists;
    const watchlists = getItem('YC_WATCHLISTS', {});
    cache.watchlists = watchlists;
    return watchlists;
}
const saveWatchlists = (watchlists: Record<string, string[]>): void => {
    setItem('YC_WATCHLISTS', watchlists);
    cache.watchlists = null; // Invalidate cache
}

export const getWatchlist = (userId: string): string[] => {
    return getWatchlists()[userId] || [];
};

export const isInWatchlist = (userId: string, movieId: string): boolean => {
    return getWatchlist(userId).includes(movieId);
};

export const toggleWatchlist = (userId: string, movieId: string): void => {
    const allWatchlists = getWatchlists();
    let userWatchlist = allWatchlists[userId] || [];

    if (userWatchlist.includes(movieId)) {
        userWatchlist = userWatchlist.filter(id => id !== movieId);
    } else {
        userWatchlist.push(movieId);
    }

    allWatchlists[userId] = userWatchlist;
    saveWatchlists(allWatchlists);
};

// --- VIEWING HISTORY ---
const getHistories = (): Record<string, { movieId: string, viewedAt: string }[]> => {
    if (cache.histories) return cache.histories;
    const histories = getItem('YC_HISTORY', {});
    cache.histories = histories;
    return histories;
}
const saveHistories = (histories: Record<string, { movieId: string, viewedAt: string }[]>): void => {
    setItem('YC_HISTORY', histories);
    cache.histories = null; // Invalidate cache
}

export const getViewingHistory = (userId: string): { movieId: string, viewedAt: string }[] => {
    return (getHistories()[userId] || []).sort((a, b) => new Date(b.viewedAt).getTime() - new Date(a.viewedAt).getTime());
};

export const addToViewingHistory = (userId: string, movieId: string): void => {
    const allHistories = getHistories();
    let userHistory = allHistories[userId] || [];
    
    // Remove if it already exists to move it to the top
    userHistory = userHistory.filter(item => item.movieId !== movieId);
    // Add to the beginning of the array
    userHistory.unshift({ movieId, viewedAt: new Date().toISOString() });
    
    // Keep history to a reasonable length, e.g., 50 movies
    if (userHistory.length > 50) {
        userHistory = userHistory.slice(0, 50);
    }

    allHistories[userId] = userHistory;
    saveHistories(allHistories);
};

// Initialize data only after all functions have been defined.
initializeData();
