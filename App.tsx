
import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import HomePage from './pages/HomePage';
import MovieDetailsPage from './pages/MovieDetailsPage';
import TrendingPage from './pages/TrendingPage';
import StaticPage from './pages/StaticPage';
import AiChatPopup from './components/AiChatPopup';
import SecurityProtections from './components/SecurityProtections';
import { STATIC_PAGES } from './constants';

const App: React.FC = () => {
  return (
    <HashRouter>
      <SecurityProtections />
      <div className="bg-gray-900 text-gray-100 min-h-screen flex flex-col">
        <Header />
        <main className="flex-grow container mx-auto px-4 py-8">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/movie/:id" element={<MovieDetailsPage />} />
            <Route path="/trending" element={<TrendingPage />} />
            <Route path="/privacy-policy" element={<StaticPage page={STATIC_PAGES.privacy} />} />
            <Route path="/dmca" element={<StaticPage page={STATIC_PAGES.dmca} />} />
            <Route path="/contact" element={<StaticPage page={STATIC_PAGES.contact} />} />
            <Route path="/advertise" element={<StaticPage page={STATIC_PAGES.advertise} />} />
          </Routes>
        </main>
        <Footer />
        <AiChatPopup />
      </div>
    </HashRouter>
  );
};

export default App;
