import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import App from './App.jsx';
import './styles.css';
import './skins.css';
import './v7.css';
import './v10.css';
import './v11.css';
import { installBgLocation } from './bgloc.js';

installBgLocation();

createRoot(document.getElementById('root')).render(<App />);

if ('serviceWorker' in navigator && location.protocol === 'https:' && /github\.io$/.test(location.hostname)) navigator.serviceWorker.register('./sw.js').catch(() => {});
