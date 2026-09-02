// Image imports. Vite resolves these to a hashed URL under out/renderer/assets
// and rewrites the reference relative to the document, which is what makes them
// work under file:// in a packaged build. A root-absolute "/emblem.png" does
// not: Electron loads the renderer with loadFile, so '/' is the filesystem
// root, not out/renderer. Import brand assets; never hardcode a '/' path.
declare module '*.png' {
  const src: string;
  export default src;
}
