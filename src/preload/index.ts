import { contextBridge, ipcRenderer } from 'electron';

// The only bridge between the (sandboxed) renderer and the main process. Keep
// this surface minimal and explicit — no raw ipcRenderer in the UI.
const api = {
  // Synchronous, unlike getAppInfo: the renderer needs this before first paint
  // to reserve space for macOS's traffic lights, and an async round-trip would
  // show the window's own controls sitting on top of the logo first.
  platform: process.platform,
  getAppInfo: (): Promise<{ backendUrl: string; version: string }> => ipcRenderer.invoke('app:info'),
  openExternal: (url: string): void => ipcRenderer.send('app:open-external', url),
};

contextBridge.exposeInMainWorld('innerlume', api);

export type InnerlumeApi = typeof api;
