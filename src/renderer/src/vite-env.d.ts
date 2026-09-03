/// <reference types="vite/client" />

// Typed env vars read via import.meta.env (see lib/platform.ts). Vite only
// exposes VITE_-prefixed keys to client code; this narrows the ambient
// ImportMetaEnv (otherwise a loose index signature) to the one var we read.
interface ImportMetaEnv {
  readonly VITE_BACKEND_URL?: string;
}
