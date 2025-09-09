
import React, { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import AiChatPopup from './components/AiChatPopup';
import SecurityProtections from './components/SecurityProtections';
import { STATIC_PAGES } from './constants';
import LoadingSpinner from './components/LoadingSpinner';

const HomePage = lazy(() => import('./pages/HomePage'));
const MovieDetailsPage = lazy(() => import('./pages/MovieDetailsPage'));
const TrendingPage = lazy(() => import('./pages/TrendingPage'));
const StaticPage = lazy(() => import('./pages/StaticPage'));

const App: React.FC = () => {
  return (
    <HashRouter>
      <SecurityProtections />
      <div className="bg-gray-900 text-gray-100 min-h-screen flex flex-col">
        <Header />
        <main className="flex-grow container mx-auto px-4 py-8">
          <Suspense fallback={<div className="flex justify-center items-center h-full py-20"><LoadingSpinner text="Loading page..." /></div>}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/movie/:id" element={<MovieDetailsPage />} />
              <Route path="/trending" element={<TrendingPage />} />
              <Route path="/privacy-policy" element={<StaticPage page={STATIC_PAGES.privacy} />} />
              <Route path="/dmca" element={<StaticPage page={STATIC_PAGES.dmca} />} />
              <Route path="/contact" element={<StaticPage page={STATIC_PAGES.contact} />} />
              <Route path="/advertise" element={<StaticPage page={STATIC_PAGES.advertise} />} />
            </Routes>
          </Suspense>
        </main>
        <Footer />
        <AiChatPopup />
      </div>
    </HashRouter>
  );
};

export default App;
