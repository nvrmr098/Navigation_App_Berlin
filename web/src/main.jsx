import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(<App />);

if ('serviceWorker' in navigator && location.protocol === 'https:' && /github\.io$/.test(location.hostname)) navigator.serviceWorker.register('./sw.js').catch(() => {});
