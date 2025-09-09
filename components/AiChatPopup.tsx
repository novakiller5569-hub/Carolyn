
import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { runChat } from '../services/geminiService';
import { ChatMessage } from '../types';
import { BotIcon, SendIcon, XIcon, ChevronDownIcon } from './icons/Icons';
import LoadingSpinner from './LoadingSpinner';

const AiChatPopup: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { sender: 'ai', text: "Hello! I'm your Yoruba Cinemax assistant. Ask me for movie recommendations or anything about our films." }
  ]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  const handleSendMessage = async () => {
    if (userInput.trim() === '' || isLoading) return;
    const userMessage: ChatMessage = { sender: 'user', text: userInput };
    setMessages(prev => [...prev, userMessage]);
    setUserInput('');
    setIsLoading(true);

    try {
      const aiResponse = await runChat(userInput);
      const aiMessage: ChatMessage = { sender: 'ai', text: aiResponse.text, movie: aiResponse.movie };
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error("Gemini API error:", error);
      const errorMessage: ChatMessage = { sender: 'ai', text: "Sorry, I'm having trouble connecting right now. Please try again later." };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };
  
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-5 right-5 bg-gradient-to-r from-green-500 to-blue-600 text-white p-4 rounded-full shadow-lg hover:scale-110 transition-transform duration-300 z-50 animate-pulse"
        aria-label="Open AI Chat"
      >
        <BotIcon />
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 w-[calc(100%-2.5rem)] max-w-sm h-[70vh] max-h-[600px] flex flex-col bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl z-50">
      <header className="flex items-center justify-between p-4 bg-gray-800 rounded-t-2xl border-b border-gray-700">
        <div className="flex items-center space-x-2">
            <BotIcon className="text-green-400" />
            <h3 className="font-bold text-white">AI Assistant</h3>
        </div>
        <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white">
          <ChevronDownIcon />
        </button>
      </header>
      
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.map((msg, index) => (
          <div key={index} className={`flex items-end gap-2 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.sender === 'ai' && <div className="w-8 h-8 flex-shrink-0 bg-green-500 rounded-full flex items-center justify-center"><BotIcon className="w-5 h-5"/></div>}
            <div className={`max-w-[80%] p-3 rounded-2xl ${msg.sender === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-700 text-gray-200 rounded-bl-none'}`}>
              <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
              {msg.movie && (
                <Link 
                  to={`/movie/${msg.movie.id}`} 
                  onClick={() => setIsOpen(false)}
                  className="mt-2 block bg-gray-800 hover:bg-gray-600 transition-colors rounded-lg p-2"
                  aria-label={`View details for ${msg.movie.title}`}
                >
                  <div className="flex items-center space-x-3">
                    <img src={msg.movie.poster} alt={msg.movie.title} className="w-12 h-16 object-cover rounded" />
                    <div>
                      <p className="font-bold text-white text-sm">{msg.movie.title}</p>
                      <p className="text-xs text-gray-400">{msg.movie.category} &bull; {new Date(msg.movie.releaseDate).getFullYear()}</p>
                    </div>
                  </div>
                </Link>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start gap-2">
            <div className="w-8 h-8 flex-shrink-0 bg-green-500 rounded-full flex items-center justify-center"><BotIcon className="w-5 h-5"/></div>
            <div className="p-3 bg-gray-700 rounded-2xl rounded-bl-none">
              <div className="flex items-center space-x-2">
                 <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
                 <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse delay-75"></div>
                 <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse delay-150"></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-gray-700">
        <div className="relative">
          <input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask for a movie..."
            className="w-full bg-gray-800 border border-gray-600 rounded-full py-2 pl-4 pr-12 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            disabled={isLoading}
          />
          <button
            onClick={handleSendMessage}
            className="absolute right-1 top-1/2 -translate-y-1/2 bg-green-600 p-2 rounded-full hover:bg-green-500 transition-colors disabled:opacity-50"
            disabled={isLoading}
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AiChatPopup;