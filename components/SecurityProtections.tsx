import React, { useEffect } from 'react';

const SecurityProtections: React.FC = () => {
  useEffect(() => {
    // NOTE: These measures are deterrents for non-technical users
    // and are not a foolproof security solution. Determined attackers
    // can still access the browser's downloaded source code.

    // --- 1. Disable Right-Click ---
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    document.addEventListener('contextmenu', handleContextMenu);

    // --- 2. Disable Keyboard Shortcuts for Dev Tools ---
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
        (e.metaKey && e.altKey && (e.key === 'i' || e.key === 'j' || e.key === 'c')) ||
        (e.ctrlKey && e.key === 'u')
      ) {
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    
    // --- 3. Detect Dev Tools Open ---
    let intervalId: number;
    const devToolsMessage = () => {
        console.clear();
        console.log('%c STOP!', 'color: red; font-size: 48px; font-weight: bold;');
        console.log('%cThis is a browser feature intended for developers. If someone told you to copy/paste something here, it is likely a scam and could give them access to your account or information.', 'font-size: 16px;');
    }
    
    const checkDevTools = () => {
        // Method 1: Check window size difference
        const threshold = 160; 
        if (window.outerWidth - window.innerWidth > threshold || window.outerHeight - window.innerHeight > threshold) {
             devToolsMessage();
        }

        // Method 2: Check by logging a special object
        const devtools = /./;
        devtools.toString = function() {
            devToolsMessage();
            return '';
        };
        console.log('%c', devtools);
    };
    
    intervalId = window.setInterval(checkDevTools, 1000);

    // Cleanup function to remove event listeners when the component unmounts
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
      clearInterval(intervalId);
    };
  }, []); // Empty dependency array means this effect runs only once on mount

  return null; // This component does not render any UI
};

export default SecurityProtections;
