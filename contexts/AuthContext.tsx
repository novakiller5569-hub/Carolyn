import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../services/types';
import * as storage from '../services/storageService';

const ADMIN_EMAIL = 'ayeyemiademola5569@gmail.com';

interface AuthContextType {
  currentUser: User | null;
  login: (email: string, password: string) => Promise<User | null>;
  signup: (name: string, email: string, password: string) => Promise<User | null>;
  logout: () => void;
  loading: boolean;
  isAdmin: boolean;
}


const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for an active session on initial load
    const session = storage.getSession();
    if (session) {
      const user = storage.getUserById(session.userId);
      if (user) {
        setCurrentUser(user);
      } else {
        // Clear invalid session
        storage.clearSession();
      }
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string): Promise<User | null> => {
    const user = storage.authenticateUser(email, password);
    if (user) {
      setCurrentUser(user);
      storage.createSession(user.id);
      return user;
    }
    return null;
  };

  const signup = async (name: string, email: string, password: string): Promise<User | null> => {
    try {
      // The User object expects a 'passwordHash' property. This now correctly passes the password
      // from the form to the 'passwordHash' field when creating a new user.
      const newUser = storage.addUser({ name, email, passwordHash: password });
      setCurrentUser(newUser);
      storage.createSession(newUser.id);
      return newUser;
    } catch (error) {
      console.error("Signup failed:", error);
      return null;
    }
  };

  const logout = () => {
    setCurrentUser(null);
    storage.clearSession();
  };
  
  const isAdmin = currentUser?.email?.toLowerCase() === ADMIN_EMAIL;
  const value = { currentUser, login, signup, logout, loading, isAdmin };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};