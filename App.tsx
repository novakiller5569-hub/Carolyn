
import React, { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import AiChatPopup from './components/AiChatPopup';
import SecurityProtections from './components/SecurityProtections';
import { STATIC_PAGES } from './constants';
import LoadingSpinner from './components/LoadingSpinner';
import { MovieProvider } from './contexts/MovieContext';
import { AuthProvider } from './contexts/AuthContext';
import WelcomePopup from './components/WelcomePopup';
import { SiteConfigProvider } from './contexts/SiteConfigContext';
import AnnouncementBanner from './components/AnnouncementBanner';

const HomePage = lazy(() => import('./pages/HomePage'));
const MovieDetailsPage = lazy(() => import('./pages/MovieDetailsPage'));
const TrendingPage = lazy(() => import('./pages/TrendingPage'));
const StaticPage = lazy(() => import('./pages/StaticPage'));
const YouTubeDownloaderPage = lazy(() => import('./pages/YouTubeDownloaderPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const SignUpPage = lazy(() => import('./pages/SignUpPage'));
const ActorPage = lazy(() => import('./pages/ActorPage'));
const WatchlistPage = lazy(() => import('./pages/WatchlistPage'));
const CollectionsPage = lazy(() => import('./pages/CollectionsPage'));


const App: React.FC = () => {
  return (
    <SiteConfigProvider>
      <AuthProvider>
        <MovieProvider>
          <HashRouter>
            <SecurityProtections />
            <div className="bg-gray-900 text-gray-100 min-h-screen flex flex-col">
              <AnnouncementBanner />
              <Header />
              <main className="flex-grow container mx-auto px-4 py-8">
                <Suspense fallback={<div className="flex justify-center items-center h-full py-20"><LoadingSpinner text="Loading page..." /></div>}>
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/movie/:id" element={<MovieDetailsPage />} />
                    <Route path="/trending" element={<TrendingPage />} />
                    <Route path="/youtube-downloader" element={<YouTubeDownloaderPage />} />
                    <Route path="/privacy-policy" element={<StaticPage page={STATIC_PAGES.privacy} />} />
                    <Route path="/dmca" element={<StaticPage page={STATIC_PAGES.dmca} />} />
                    <Route path="/contact" element={<StaticPage page={STATIC_PAGES.contact} />} />
                    <Route path="/advertise" element={<StaticPage page={STATIC_PAGES.advertise} />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/signup" element={<SignUpPage />} />
                    <Route path="/actor/:name" element={<ActorPage />} />
                    <Route path="/watchlist" element={<WatchlistPage />} />
                    <Route path="/collections" element={<CollectionsPage />} />
                  </Routes>
                </Suspense>
              </main>
              <Footer />
              <AiChatPopup />
              <WelcomePopup />
            </div>
          </HashRouter>
        </MovieProvider>
      </AuthProvider>
    </SiteConfigProvider>
  );
};

export default App;