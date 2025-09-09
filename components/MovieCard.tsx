
import React from 'react';
import { Link } from 'react-router-dom';
import { Movie } from '../types';
import { StarIcon } from './icons/Icons';

interface MovieCardProps {
  movie: Movie;
  animationDelay?: string;
}

const MovieCard: React.FC<MovieCardProps> = ({ movie, animationDelay }) => {
  const style = animationDelay ? { animationDelay } : {};
  return (
    <Link 
      to={`/movie/${movie.id}`} 
      className="group block bg-gray-800 rounded-lg overflow-hidden shadow-lg hover:shadow-green-500/20 transition-all duration-300 transform hover:-translate-y-1 border border-gray-700/50 animate-fade-in"
      style={style}
    >
      <div className="relative">
        <div className="aspect-[3/4] w-full">
          <img 
            src={movie.poster} 
            alt={movie.title} 
            className="w-full h-full object-cover group-hover:opacity-75 transition-opacity duration-300"
            loading="lazy"
          />
        </div>
        <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm text-white px-2 py-1 rounded-full text-xs font-bold flex items-center space-x-1">
          <StarIcon className="w-3 h-3 text-yellow-400" />
          <span>{movie.rating.toFixed(1)}</span>
        </div>
         <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-black/0 opacity-100 group-hover:opacity-100 transition-opacity duration-300"></div>
      </div>
      <div className="p-3">
        <h3 className="text-sm font-semibold text-white truncate group-hover:text-green-400 transition-colors duration-300">{movie.title}</h3>
        <div className="flex justify-between items-center mt-1 text-xs text-gray-400">
          <span>{movie.category}</span>
          <span>{new Date(movie.releaseDate).getFullYear()}</span>
        </div>
      </div>
    </Link>
  );
};

export default React.memo(MovieCard);
