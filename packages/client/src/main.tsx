import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const el = document.getElementById('root');
if (!el) throw new Error('missing #root');
createRoot(el).render(<App />);

// Offline play (v0.2 acceptance): cache the shell + assets after first visit.
// Production only — a stale worker fighting Vite HMR makes dev miserable.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline cache is progressive enhancement — the game runs without it.
    });
  });
}
