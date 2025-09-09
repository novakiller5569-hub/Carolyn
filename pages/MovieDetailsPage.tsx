import React, { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { MOVIES } from '../constants';
import MovieCard from '../components/MovieCard';
import { StarIcon, UserIcon, ReplyIcon, ChevronDownIcon, ChevronUpIcon, BotIcon, SparklesIcon } from '../components/icons/Icons';
import LoadingSpinner from '../components/LoadingSpinner';
import { Comment, Movie } from '../types';
import { getAiRecommendations } from '../services/geminiService';
import BackButton from '../components/BackButton';

const USERNAME_KEY = 'yorubaCinemaxUsername';

// Sub-component for the form to add comments/replies
const CommentForm: React.FC<{
  parentId?: string | null;
  onSubmit: (comment: Comment) => void;
  onCancel?: () => void;
  submitLabel?: string;
}> = ({ parentId = null, onSubmit, onCancel, submitLabel = "Submit" }) => {
    const [username, setUsername] = useState<string | null>(localStorage.getItem(USERNAME_KEY));
    const [tempUsername, setTempUsername] = useState('');
    const [commentText, setCommentText] = useState('');
    const [rating, setRating] = useState(0);
    const [hoverRating, setHoverRating] = useState(0);

    const handleNameSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (tempUsername.trim()) {
            localStorage.setItem(USERNAME_KEY, tempUsername.trim());
            setUsername(tempUsername.trim());
        }
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!commentText.trim() || !username) return;

        const newComment: Comment = {
            id: new Date().toISOString(),
            parentId,
            reviewer: username,
            comment: commentText.trim(),
            date: new Date().toISOString().split('T')[0],
            replies: [],
            rating: parentId === null && rating > 0 ? rating : undefined,
        };
        onSubmit(newComment);
        setCommentText('');
        setRating(0);
        if (onCancel) {
            onCancel();
        }
    };

    if (!username) {
        return (
            <form onSubmit={handleNameSubmit} className="flex items-center gap-2 p-4 bg-gray-800 rounded-lg border border-gray-700 my-4">
                <UserIcon className="w-6 h-6 text-gray-400" />
                <input
                    type="text"
                    value={tempUsername}
                    onChange={(e) => setTempUsername(e.target.value)}
                    placeholder="Enter your name to comment"
                    className="flex-grow bg-gray-700 border border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <button type="submit" className="bg-green-600 text-white font-bold py-2 px-4 rounded-md hover:bg-green-500 transition-colors">
                    Save Name
                </button>
            </form>
        )
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-3">
            <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={parentId ? `Replying as ${username}...` : `Commenting as ${username}...`}
                rows={3}
                className="w-full bg-gray-700 border border-gray-600 rounded-md p-3 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                required
            />
            {parentId === null && (
                 <div className="flex items-center gap-2">
                    <span className="text-gray-400">Your Rating:</span>
                    <div className="flex">
                        {[1, 2, 3, 4, 5].map((star) => (
                            <button
                                type="button"
                                key={star}
                                onClick={() => setRating(star)}
                                onMouseEnter={() => setHoverRating(star)}
                                onMouseLeave={() => setHoverRating(0)}
                                className="text-2xl"
                            >
                                <StarIcon
                                    className={`w-6 h-6 transition-colors ${
                                        (hoverRating || rating) >= star ? 'text-yellow-400' : 'text-gray-600'
                                    }`}
                                />
                            </button>
                        ))}
                    </div>
                </div>
            )}
            <div className="flex justify-end gap-2">
                {onCancel && (
                    <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 rounded-md hover:bg-gray-500 transition-colors">
                        Cancel
                    </button>
                )}
                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-500 transition-colors disabled:opacity-50" disabled={!commentText.trim()}>
                    {submitLabel}
                </button>
            </div>
        </form>
    );
};


// Sub-component for a single comment item
const CommentItem: React.FC<{
  comment: Comment;
  onReply: (reply: Comment) => void;
}> = ({ comment, onReply }) => {
    const [showReplyForm, setShowReplyForm] = useState(false);
    const [showReplies, setShowReplies] = useState(true);

    const handleReplySubmit = (reply: Comment) => {
        onReply(reply);
        setShowReplyForm(false);
    };

    return (
        <div className={`ml-${comment.parentId ? '6' : '0'} mt-4`}>
            <div className="flex items-start space-x-3">
                 <div className="flex-shrink-0 w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center">
                    {comment.isAI ? <BotIcon className="w-6 h-6 text-green-400" /> : <UserIcon className="w-6 h-6 text-gray-400" />}
                </div>
                <div className="flex-1">
                    <div className="bg-gray-800 rounded-lg p-3 border border-gray-700/50">
                        <div className="flex items-center justify-between">
                            <p className="font-bold text-white">{comment.reviewer}</p>
                            <span className="text-xs text-gray-500">{new Date(comment.date).toLocaleDateString()}</span>
                        </div>
                        {comment.rating && (
                            <div className="flex items-center my-1">
                                {[...Array(5)].map((_, i) => (
                                    <StarIcon key={i} className={`w-4 h-4 ${i < comment.rating! ? 'text-yellow-400' : 'text-gray-600'}`} />
                                ))}
                            </div>
                        )}
                        <p className={`text-gray-300 mt-1 whitespace-pre-wrap ${comment.isAI ? 'italic' : ''}`}>{comment.comment}</p>
                    </div>
                    <div className="mt-1 flex items-center space-x-4">
                        <button onClick={() => setShowReplyForm(!showReplyForm)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-green-400 transition-colors">
                            <ReplyIcon className="w-3 h-3"/> Reply
                        </button>
                        {comment.replies.length > 0 && (
                             <button onClick={() => setShowReplies(!showReplies)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors">
                                {showReplies ? <ChevronUpIcon className="w-3 h-3"/> : <ChevronDownIcon className="w-3 h-3"/>}
                                {comment.replies.length} {comment.replies.length > 1 ? 'replies' : 'reply'}
                             </button>
                        )}
                    </div>
                </div>
            </div>
            {showReplyForm && (
                <div className="ml-12 mt-2">
                    <CommentForm
                        parentId={comment.id}
                        onSubmit={handleReplySubmit}
                        onCancel={() => setShowReplyForm(false)}
                        submitLabel="Post Reply"
                    />
                </div>
            )}
            {showReplies && comment.replies.length > 0 && (
                <div className="border-l-2 border-gray-700 ml-5 pl-1">
                    {comment.replies.map(reply => (
                        <CommentItem key={reply.id} comment={reply} onReply={onReply} />
                    ))}
                </div>
            )}
        </div>
    );
};


// Sub-component to manage the entire comments section
const CommentsSection: React.FC<{ initialComments: Comment[], movieId: string }> = ({ initialComments, movieId }) => {
    const [commentsList, setCommentsList] = useState(initialComments);

    useEffect(() => {
        setCommentsList(initialComments);
    }, [initialComments]);

    const handleNewComment = (comment: Comment) => {
        setCommentsList(prev => [...prev, comment]);
    };

    const handleNewReply = (reply: Comment) => {
        const addReply = (comments: Comment[]): Comment[] => {
            return comments.map(c => {
                if (c.id === reply.parentId) {
                    return { ...c, replies: [...c.replies, reply] };
                }
                if (c.replies.length > 0) {
                    return { ...c, replies: addReply(c.replies) };
                }
                return c;
            });
        };
        setCommentsList(prev => addReply(prev));
    };

    const topLevelComments = useMemo(() => {
        const commentMap = new Map<string, Comment>();
        const rootComments: Comment[] = [];

        commentsList.forEach(c => {
            c.replies = c.replies || []; // Ensure replies array exists
            commentMap.set(c.id, c);
        });

        commentsList.forEach(c => {
            if (c.parentId && commentMap.has(c.parentId)) {
                const parent = commentMap.get(c.parentId)!;
                if (!parent.replies.some(r => r.id === c.id)) { // Prevent duplicates
                   parent.replies.push(c);
                }
            } else {
                rootComments.push(c);
            }
        });
        
        return rootComments.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [commentsList]);

    return (
        <section className="mt-12">
            <h2 className="text-3xl font-bold text-white mb-6">Reviews & Comments</h2>
            <div className="mb-8">
                <CommentForm onSubmit={handleNewComment} />
            </div>
            <div>
                {topLevelComments.length > 0 ? (
                    topLevelComments.map(comment => (
                        <CommentItem key={comment.id} comment={comment} onReply={handleNewReply} />
                    ))
                ) : (
                    <p className="text-gray-500">Be the first to leave a comment!</p>
                )}
            </div>
        </section>
    );
};

// Main component for the movie details page
const MovieDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [aiRecs, setAiRecs] = useState<{ movie: Movie, reason: string }[] | null>(null);
  const [isLoadingRecs, setIsLoadingRecs] = useState(true);

  const movie = useMemo(() => MOVIES.find((m) => m.id === id), [id]);

  useEffect(() => {
    window.scrollTo(0, 0);

    const fetchRecommendations = async () => {
        if (movie) {
            setIsLoadingRecs(true);
            try {
                const recsData = await getAiRecommendations(movie);
                if (recsData) {
                    const recommendedMovies = recsData
                        .map(rec => ({
                            movie: MOVIES.find(m => m.id === rec.movieId),
                            reason: rec.reason
                        }))
                        .filter(item => item.movie) as { movie: Movie, reason: string }[];
                    setAiRecs(recommendedMovies);
                }
            } catch (error) {
                console.error("Failed to fetch AI recommendations:", error);
                setAiRecs(null);
            } finally {
                setIsLoadingRecs(false);
            }
        }
    };
    fetchRecommendations();
  }, [movie]);

  if (!movie) {
    return (
        <div className="text-center py-20">
            <BackButton />
            <h1 className="text-4xl font-bold text-white">404 - Movie Not Found</h1>
            <p className="text-gray-400 mt-4">We couldn't find the movie you were looking for.</p>
        </div>
    );
  }

  const relatedMovies = MOVIES.filter(m => m.category === movie.category && m.id !== movie.id).slice(0, 5);

  return (
    <div>
        <BackButton />
        <section className="flex flex-col md:flex-row gap-8 md:gap-12 animate-fade-in">
            <div className="md:w-1/3 flex-shrink-0">
                <img src={movie.poster} alt={movie.title} className="w-full h-auto object-cover rounded-lg shadow-2xl" />
            </div>
            <div className="md:w-2/3">
                <h1 className="text-4xl md:text-5xl font-black text-white">{movie.title}</h1>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 my-4 text-gray-300">
                    <div className="flex items-center text-yellow-400">
                        <StarIcon className="w-5 h-5 mr-1" />
                        <span className="font-bold text-lg">{movie.rating.toFixed(1)}</span>
                    </div>
                    <span>&bull;</span>
                    <span>{new Date(movie.releaseDate).getFullYear()}</span>
                    <span>&bull;</span>
                    <span>{movie.runtime}</span>
                    <span>&bull;</span>
                    <span className="px-2 py-1 bg-gray-700 text-xs rounded">{movie.category}</span>
                </div>
                <p className="text-gray-300 leading-relaxed mb-6">{movie.description}</p>
                <div className="space-y-2 text-sm">
                    <p><strong className="text-gray-200">Starring:</strong> {movie.stars.join(', ')}</p>
                    <p><strong className="text-gray-200">Genre:</strong> {movie.genre}</p>
                </div>
                <a
                    href={movie.downloadLink}
                    className="mt-8 inline-block w-full text-center sm:w-auto bg-gradient-to-r from-green-500 to-blue-600 text-white font-bold py-3 px-10 rounded-full text-lg shadow-lg hover:shadow-green-500/40 transition-all duration-300 transform hover:scale-105"
                >
                    Download Movie
                </a>
            </div>
        </section>

        {movie.trailerId && (
            <section className="mt-12">
                <h2 className="text-3xl font-bold text-white mb-4">Watch Trailer</h2>
                <div className="relative overflow-hidden pt-[56.25%] rounded-lg border-2 border-gray-800">
                    <iframe 
                        src={`https://www.youtube.com/embed/${movie.trailerId}`} 
                        title={`${movie.title} Trailer`}
                        frameBorder="0" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                        allowFullScreen
                        className="absolute top-0 left-0 w-full h-full"
                    ></iframe>
                </div>
            </section>
        )}
        
        {isLoadingRecs ? (
            <div className="mt-12"><LoadingSpinner text="Getting AI Recommendations..." /></div>
        ) : aiRecs && aiRecs.length > 0 && (
             <section className="mt-12">
                <h2 className="text-3xl font-bold text-white mb-4 flex items-center gap-2">
                    <SparklesIcon className="text-green-400"/>
                    AI Recommendations
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {aiRecs.map(({ movie: recMovie, reason }) => (
                       <div key={recMovie.id} className="bg-gray-800/50 p-3 rounded-lg flex flex-col">
                           <MovieCard movie={recMovie} />
                           <p className="text-sm text-gray-400 mt-3 p-2 italic border-l-2 border-green-500 bg-gray-800 rounded-r-md flex-grow">"{reason}"</p>
                       </div>
                    ))}
                </div>
            </section>
        )}

        <CommentsSection initialComments={movie.comments || []} movieId={movie.id} />

        {relatedMovies.length > 0 && (
            <section className="mt-12">
                <h2 className="text-3xl font-bold text-white mb-4">Related Movies</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
                    {relatedMovies.map((relatedMovie, index) => (
                        <MovieCard key={relatedMovie.id} movie={relatedMovie} animationDelay={`${index * 75}ms`} />
                    ))}
                </div>
            </section>
        )}
    </div>
  );
};

export default MovieDetailsPage;
