
import React, { useState, useEffect, useMemo } from 'react';
import { Movie } from '../services/types';
import * as storage from '../services/storageService';
import { useAuth } from '../contexts/AuthContext';
import { useMovies } from '../contexts/MovieContext';
import { getAiPersonalizedRecommendations } from '../services/geminiService';
// FIX: Corrected the import for MovieCarousel. It should be imported from its own file within the components directory.
import MovieCarousel from './MovieCarousel';
import LoadingSpinner from './LoadingSpinner';

const PersonalizedRows: React.FC = () => {
  const { currentUser } = useAuth();
  const { movies } = useMovies();

  const [aiPicks, setAiPicks] = useState<Movie[]>([]);
  const [isLoadingAiPicks, setIsLoadingAiPicks] = useState(false);

  const viewingHistory = useMemo(() => {
    if (!currentUser) return [];
    return storage.getViewingHistory(currentUser.id);
  }, [currentUser]);

  const lastWatchedMovie = useMemo(() => {
    if (viewingHistory.length === 0) return null;
    return movies.find(m => m.id === viewingHistory[0].movieId);
  }, [viewingHistory, movies]);
  
  const becauseYouWatched = useMemo(() => {
    if (!lastWatchedMovie) return [];
    return movies
      .filter(m => m.id !== lastWatchedMovie.id && m.category === lastWatchedMovie.category)
      .slice(0, 10);
  }, [lastWatchedMovie, movies]);


  useEffect(() => {
    const fetchAiPicks = async () => {
      if (currentUser && viewingHistory.length > 0 && movies.length > 0) {
        setIsLoadingAiPicks(true);
        try {
          const recs = await getAiPersonalizedRecommendations(viewingHistory, movies);
          if (recs) {
            const recommendedMovies = recs
              .map(rec => movies.find(m => m.id === rec.movieId))
              .filter((m): m is Movie => !!m);
            setAiPicks(recommendedMovies);
          }
        } catch (error) {
          console.error("Failed to fetch AI picks:", error);
          setAiPicks([]);
        } finally {
          setIsLoadingAiPicks(false);
        }
      }
    };
    fetchAiPicks();
  }, [currentUser, viewingHistory, movies]);


  if (!currentUser || viewingHistory.length === 0) {
    return null;
  }

  return (
    <>
      {isLoadingAiPicks ? (
        <div className="flex justify-center my-8"><LoadingSpinner text="Curating your top picks..." /></div>
      ) : (
        aiPicks.length > 0 && <MovieCarousel title="Top Picks For You" movies={aiPicks} />
      )}
      
      {becauseYouWatched.length > 0 && lastWatchedMovie && (
        <MovieCarousel 
          title={`Because you watched ${lastWatchedMovie.title}`} 
          movies={becauseYouWatched} 
        />
      )}
    </>
  );
};

export default PersonalizedRows;