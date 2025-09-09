
import React from 'react';
import { Link } from 'react-router-dom';
import { FacebookIcon, TwitterIcon, InstagramIcon, YouTubeIcon } from './icons/Icons';
import { useSiteConfig } from '../contexts/SiteConfigContext';

const Footer: React.FC = () => {
  const { config } = useSiteConfig();
  const quickLinks = [
    { name: 'Privacy Policy', path: '/privacy-policy' },
    { name: 'DMCA', path: '/dmca' },
    { name: 'Contact Us', path: '/contact' },
    { name: 'Advertise', path: '/advertise' },
  ];

  const socialLinks = [
    { icon: <FacebookIcon />, href: '#' },
    { icon: <TwitterIcon />, href: '#' },
    { icon: <InstagramIcon />, href: '#' },
    { icon: <YouTubeIcon />, href: '#' },
  ];

  return (
    <footer className="bg-gray-950 border-t border-gray-800">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-green-400 to-blue-500">{config.name}</h3>
            <p className="text-gray-400 mt-2 text-sm">
              {config.tagline}
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-gray-200">Quick Links</h4>
            <ul className="mt-4 space-y-2">
              {quickLinks.map((link) => (
                <li key={link.name}>
                  <Link to={link.path} className="text-gray-400 hover:text-green-400 transition-colors text-sm">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-gray-200">Follow Us</h4>
            <div className="flex space-x-4 mt-4">
              {socialLinks.map((link, index) => (
                <a key={index} href={link.href} className="text-gray-400 hover:text-green-400 transition-colors">
                  {link.icon}
                </a>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-8 pt-8 border-t border-gray-800 text-center text-gray-500 text-sm">
          <p>&copy; {new Date().getFullYear()} {config.name}. All Rights Reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;