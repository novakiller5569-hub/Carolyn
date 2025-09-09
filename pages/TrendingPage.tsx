import React, { useState, useEffect, useRef } from 'react';
import MovieCard from '../components/MovieCard';
import Pagination from '../components/Pagination';
import { MOVIES } from '../constants';
import BackButton from '../components/BackButton';

const MOVIES_PER_PAGE = 10;

const TrendingPage: React.FC = () => {
  const [currentPage, setCurrentPage] = useState(1);
  const pageContentRef = useRef<HTMLDivElement>(null);

  // The movies are sorted by popularity to establish the trend ranking
  const trendingMovies = [...MOVIES].sort((a, b) => b.popularity - a.popularity);

  const totalPages = Math.ceil(trendingMovies.length / MOVIES_PER_PAGE);
  const currentMovies = trendingMovies.slice(
    (currentPage - 1) * MOVIES_PER_PAGE,
    currentPage * MOVIES_PER_PAGE
  );

  useEffect(() => {
    // Scroll to top of content when page changes, but not on initial load
    if (pageContentRef.current) {
      const headerOffset = 80; // Approximate height of the sticky header
      const elementPosition = pageContentRef.current.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
      
      // Only scroll if the content is not already in view
      if (elementPosition < headerOffset) {
         window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
         });
      }
    }
  }, [currentPage]);


  return (
    <div>
      <BackButton />
      <section className="text-center py-8 animate-fade-in" ref={pageContentRef}>
        <h1 className="text-4xl md:text-5xl font-black bg-clip-text text-transparent bg-gradient-to-r from-green-400 to-blue-500">
          Trending Movies
        </h1>
        <p className="text-gray-300 mt-2">Discover what's popular right now, ranked by popularity.</p>
      </section>

      <section className="mt-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 md:gap-x-6 gap-y-10">
          {currentMovies.map((movie, index) => {
            const rank = index + 1 + (currentPage - 1) * MOVIES_PER_PAGE;
            return (
              <div key={movie.id} className="relative group">
                <div className="absolute -left-3 -top-4 z-20 transition-transform duration-300 group-hover:scale-110" aria-label={`Rank ${rank}`}>
                   <div className="w-10 h-10 bg-gray-900 border-2 border-gray-600 rounded-full flex items-center justify-center shadow-lg">
                      <span className="text-green-400 font-bold text-lg" style={{fontFamily: 'monospace'}}>{rank}</span>
                   </div>
                </div>
                <MovieCard movie={movie} animationDelay={`${index * 50}ms`} />
              </div>
            );
          })}
        </div>
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      </section>
    </div>
  );
};

export default TrendingPage;
