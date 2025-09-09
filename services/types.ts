
export interface Comment {
  id: string;
  parentId?: string | null;
  reviewer: string;
  comment: string;
  date: string;
  rating?: number; // Rating is now optional for replies
  replies: Comment[];
  isAI?: boolean;
}

export interface Movie {
  id: string;
  title: string;
  poster: string;
  downloadLink: string;
  genre: string;
  category: 'Drama' | 'Comedy' | 'Action' | 'Romance' | 'Thriller' | 'Epic';
  releaseDate: string;
  stars: string[];
  runtime: string;
  rating: number;
  description: string;
  popularity: number;
  createdAt: string;
  updatedAt: string;
  comments?: Comment[];
  trailerId?: string;
}

export interface ChatMessage {
  sender: 'user' | 'ai';
  text: string;
  movie?: Movie;
}