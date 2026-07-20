/**
 * Innerlume brand palette — lifted from innerlumehealing.com.
 *
 * The site's real accent is a warm terracotta (Squarespace `--accent-hsl`), with
 * Libre Baskerville headings + Source Sans 3 body. These are the *raw brand tokens*;
 * the applied light/dark theme (semantic variables) lives in `theme.css`. Keep
 * this file the single source of truth for the brand hues.
 */
export const brand = {
  terracotta: '#AA7660', // accent        hsl(17.84, 30.33%, 52.16%)
  sienna: '#7F3111', // dark accent    hsl(17.84, 77.62%, 28.04%)
  sand: '#D4BAAF', // light accent   hsl(17.84, 30.08%, 75.88%)
  espresso: '#150803', // near-black     hsl(16.67, 75%, 4.71%)
  white: '#FFFFFF',
} as const;

export const fonts = {
  heading: "'Libre Baskerville', Georgia, 'Times New Roman', serif",
  body: "'Source Sans 3', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
} as const;

export type ThemeMode = 'light' | 'dark' | 'system';
