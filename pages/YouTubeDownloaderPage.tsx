
import React, { useState } from 'react';
import BackButton from '../components/BackButton';
import LoadingSpinner from '../components/LoadingSpinner';
import { LinkIcon, DownloadIcon } from '../components/icons/Icons';

const MOCKED_VIDEO_DETAILS = {
  thumbnail: 'https://picsum.photos/seed/youtube-downloader/480/270',
  title: 'Jagun Jagun (The Warrior) | Official Trailer',
  channel: 'Yoruba Cinemax',
};

const DOWNLOAD_OPTIONS = [
  { quality: '1080p', format: 'MP4', type: 'Full HD', size: '150.MB' },
  { quality: '720p', format: 'MP4', type: 'HD', size: '95.5MB' },
  { quality: '360p', format: 'MP4', type: 'SD', size: '45.2MB' },
  { quality: 'Audio', format: 'MP3', type: '128kbps', size: '5.8MB' },
];

const YouTubeDownloaderPage: React.FC = () => {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [videoDetails, setVideoDetails] = useState<typeof MOCKED_VIDEO_DETAILS | null>(null);

  const handleFetchVideo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setIsLoading(true);
    setVideoDetails(null);

    // Simulate API call
    setTimeout(() => {
      setVideoDetails(MOCKED_VIDEO_DETAILS);
      setIsLoading(false);
    }, 1500);
  };

  return (
    <div className="max-w-4xl mx-auto py-8">
      <BackButton />
      <section className="text-center animate-fade-in">
        <h1 className="text-4xl md:text-5xl font-black bg-clip-text text-transparent bg-gradient-to-r from-green-400 to-blue-500">
          YouTube Video Downloader
        </h1>
        <p className="text-gray-300 mt-2 max-w-2xl mx-auto">
          Paste any YouTube link below to get your download options. This feature is for frontend demonstration and does not perform actual downloads.
        </p>
      </section>

      <section className="mt-12">
        <form onSubmit={handleFetchVideo} className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-grow">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <LinkIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-green-500 transition-all"
              required
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="bg-gradient-to-r from-green-500 to-blue-600 text-white font-bold py-3 px-8 rounded-lg shadow-lg hover:shadow-green-500/40 transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Fetching...' : 'Fetch Video'}
          </button>
        </form>
      </section>

      {isLoading && (
        <div className="mt-12 flex justify-center">
          <LoadingSpinner text="Analyzing link..." />
        </div>
      )}

      {videoDetails && (
        <section className="mt-12 animate-fade-in bg-gray-800/50 border border-gray-700 rounded-xl p-6">
          <div className="flex flex-col md:flex-row gap-6">
            <img 
              src={videoDetails.thumbnail} 
              alt="Video thumbnail" 
              className="w-full md:w-64 h-auto object-cover rounded-lg"
            />
            <div className="flex-grow">
              <p className="text-sm text-gray-400">{videoDetails.channel}</p>
              <h2 className="text-2xl font-bold text-white mt-1">{videoDetails.title}</h2>
            </div>
          </div>
          <div className="mt-8">
            <h3 className="text-xl font-semibold text-white mb-4">Download Options</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {DOWNLOAD_OPTIONS.map((option, index) => (
                <div key={index} className="bg-gray-700 rounded-lg p-4 flex flex-col items-center text-center border border-gray-600/50">
                  <span className="text-lg font-bold text-green-400">{option.quality}</span>
                  <span className="text-sm text-gray-300">{option.type}</span>
                  <div className="my-3 text-xs text-gray-400">
                    <span>{option.format}</span>
                    <span className="mx-1">&bull;</span>
                    <span>{option.size}</span>
                  </div>
                   <button className="w-full mt-auto inline-flex items-center justify-center gap-2 bg-green-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-green-500 transition-colors">
                    <DownloadIcon className="w-4 h-4" />
                    Download
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default YouTubeDownloaderPage;
