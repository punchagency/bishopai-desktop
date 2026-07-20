import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from './theme/ThemeProvider';
import { App } from './App';

import './theme/fonts.css';
import './theme/theme.css';
import './components/components.css';
import './index.css';
import './theme/animations.css';

// Stamped before React mounts, so platform-specific layout — the space macOS
// reserves for its traffic lights — is right on the first frame instead of
// shifting once the app renders.
document.documentElement.dataset.platform =
  (window as { innerlume?: { platform?: string } }).innerlume?.platform ?? 'web';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
