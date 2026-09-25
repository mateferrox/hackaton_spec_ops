import React from 'react';
import ReactDOM from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-700.css';
import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><MotionConfig reducedMotion="user"><App /></MotionConfig></React.StrictMode>);
