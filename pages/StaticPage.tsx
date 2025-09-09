import React, { useEffect } from 'react';
import BackButton from '../components/BackButton';

interface StaticPageProps {
  page: {
    title: string;
    content: string;
  };
}

const StaticPage: React.FC<StaticPageProps> = ({ page }) => {
    
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);

  return (
    <div className="max-w-4xl mx-auto py-8">
      <BackButton />
      <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-green-400 to-blue-500 mb-8">
        {page.title}
      </h1>
      <div className="prose prose-invert prose-lg text-gray-300 leading-relaxed">
        <p>{page.content}</p>
      </div>
    </div>
  );
};

export default StaticPage;
