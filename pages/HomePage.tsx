import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import MovieCard from '../components/MovieCard';
import Pagination from '../components/Pagination';
import { MOVIES } from '../constants';
import { Movie } from '../types';
import { StarIcon, ChevronLeftIcon, ChevronRightIcon } from '../components/icons/Icons';

const MOVIES_PER_PAGE = 10;

// Sub-component for the hero banner
const FeaturedMovie: React.FC<{ movie: Movie }> = ({ movie }) => (
  <section className="relative h-[60vh] md:h-[70vh] rounded-2xl overflow-hidden mb-12 animate-fade-in">
    <img src={movie.poster} alt={movie.title} className="absolute inset-0 w-full h-full object-cover object-center blur-sm scale-110" />
    <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/70 to-transparent"></div>
    <div className="absolute inset-0 flex items-center">
      <div className="container mx-auto px-4 md:px-8 flex flex-col md:flex-row items-center gap-8 text-white">
        <img src={movie.poster} alt={movie.title} className="w-48 md:w-64 h-auto object-cover rounded-lg shadow-2xl shadow-black/50 hidden md:block" />
        <div className="md:w-1/2 text-center md:text-left">
          <h1 className="text-4xl md:text-6xl font-black">{movie.title}</h1>
          <div className="flex items-center justify-center md:justify-start space-x-4 my-4">
            <div className="flex items-center text-yellow-400">
              <StarIcon className="w-5 h-5 mr-1" />
              <span className="font-bold text-lg">{movie.rating.toFixed(1)}</span>
            </div>
            <span className="text-gray-400">&bull;</span>
            <span className="text-gray-300">{new Date(movie.releaseDate).getFullYear()}</span>
            <span className="text-gray-400">&bull;</span>
            <span className="text-gray-300">{movie.runtime}</span>
          </div>
          <p className="text-gray-300 leading-relaxed line-clamp-3">{movie.description}</p>
          <Link
            to={`/movie/${movie.id}`}
            className="mt-6 inline-block bg-gradient-to-r from-green-500 to-blue-600 text-white font-bold py-3 px-8 rounded-full text-lg shadow-lg hover:shadow-green-500/40 transition-all duration-300 transform hover:scale-105"
          >
            Watch Now
          </Link>
        </div>
      </div>
    </div>
  </section>
);

// Sub-component for the horizontal movie carousel
const MovieCarousel: React.FC<{ title: string; movies: Movie[] }> = ({ title, movies }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current;
      const scrollTo = direction === 'left' ? scrollLeft - clientWidth * 0.8 : scrollLeft + clientWidth * 0.8;
      scrollRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
    }
  };

  return (
    <section className="mb-12">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-3xl font-bold text-white">{title}</h2>
        <div className="space-x-2">
          <button onClick={() => scroll('left')} className="p-2 bg-gray-800/50 rounded-full hover:bg-green-600 transition-colors"><ChevronLeftIcon/></button>
          <button onClick={() => scroll('right')} className="p-2 bg-gray-800/50 rounded-full hover:bg-green-600 transition-colors"><ChevronRightIcon/></button>
        </div>
      </div>
      <div ref={scrollRef} className="flex space-x-4 md:space-x-6 overflow-x-auto pb-4 no-scrollbar">
        {movies.map((movie, index) => (
          <div key={movie.id} className="flex-shrink-0 w-40 sm:w-48 md:w-56">
            <MovieCard movie={movie} animationDelay={`${index * 75}ms`} />
          </div>
        ))}
      </div>
    </section>
  );
};


const HomePage: React.FC = () => {
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState({
    category: 'All',
    year: 'All',
    sort: 'newest',
  });
  const isInitialMount = useRef(true);

  const featuredMovie = useMemo(() => [...MOVIES].sort((a, b) => b.popularity - a.popularity)[0], []);
  const trendingMovies = useMemo(() => [...MOVIES].sort((a, b) => b.popularity - a.popularity).slice(0, 8), []);

  useEffect(() => {
    if (isInitialMount.current) {
        isInitialMount.current = false;
    } else {
        const section = document.getElementById('explore-movies-section');
        if (section) {
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
  }, [currentPage]);

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setCurrentPage(1);
  };

  const filteredAndSortedMovies = useMemo(() => {
    let filtered = MOVIES.filter(movie => {
      const categoryMatch = filters.category === 'All' || movie.category === filters.category;
      const yearMatch = filters.year === 'All' || new Date(movie.releaseDate).getFullYear().toString() === filters.year;
      return categoryMatch && yearMatch;
    });

    switch (filters.sort) {
      case 'newest':
        filtered.sort((a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime());
        break;
      case 'oldest':
        filtered.sort((a, b) => new Date(a.releaseDate).getTime() - new Date(b.releaseDate).getTime());
        break;
      case 'rating':
        filtered.sort((a, b) => b.rating - a.rating);
        break;
      case 'popularity':
        filtered.sort((a, b) => b.popularity - a.popularity);
        break;
    }
    return filtered;
  }, [filters]);

  const totalPages = Math.ceil(filteredAndSortedMovies.length / MOVIES_PER_PAGE);
  const currentMovies = filteredAndSortedMovies.slice(
    (currentPage - 1) * MOVIES_PER_PAGE,
    currentPage * MOVIES_PER_PAGE
  );

  const categories = ['All', ...Array.from(new Set(MOVIES.map(m => m.category)))];
  const years = ['All', ...Array.from(new Set(MOVIES.map(m => new Date(m.releaseDate).getFullYear()))).sort((a,b) => b-a).map(String)];
  
  const FilterSelect: React.FC<{name: string, label: string, value: string, options: string[], onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void}> = ({name, label, value, options, onChange}) => (
    <div>
      <label htmlFor={name} className="sr-only">{label}</label>
      <select
        id={name}
        name={name}
        value={value}
        onChange={onChange}
        className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:ring-green-500 focus:border-green-500 block w-full p-2.5"
      >
        {options.map(opt => <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>)}
      </select>
    </div>
  );


  return (
    <div>
      <FeaturedMovie movie={featuredMovie} />
      <MovieCarousel title="Trending Now" movies={trendingMovies} />

      <section id="explore-movies-section" className="mt-12">
        <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4">
            <h2 className="text-3xl font-bold text-white">Explore All Movies</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-4">
              <FilterSelect name="category" label="Category" value={filters.category} onChange={handleFilterChange} options={categories} />
              <FilterSelect name="year" label="Year" value={filters.year} onChange={handleFilterChange} options={years} />
              <FilterSelect name="sort" label="Sort By" value={filters.sort} onChange={handleFilterChange} options={['newest', 'oldest', 'rating', 'popularity']} />
            </div>
        </div>

        {currentMovies.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
            {currentMovies.map((movie: Movie, index: number) => (
              <MovieCard key={movie.id} movie={movie} animationDelay={`${index * 75}ms`} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 text-gray-400">
            <h2 className="text-2xl font-bold">No Movies Found</h2>
            <p>Try adjusting your filters.</p>
          </div>
        )}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      </section>
    </div>
  );
};

export default HomePage;