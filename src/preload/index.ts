import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

// The only bridge between the (sandboxed) renderer and the main process. Keep
// this surface minimal and explicit — no raw ipcRenderer in the UI.
const api = {
  getAppInfo: (): Promise<{ backendUrl: string; version: string }> => ipcRenderer.invoke('app:info'),
  openExternal: (url: string): void => ipcRenderer.send('app:open-external', url),
  bee: {
    getStatus: () => ipcRenderer.invoke('bee:status'),
    connect: () => ipcRenderer.invoke('bee:connect'),
    // Live courier status pushed from main; returns an unsubscribe fn.
    onStatus: (cb: (s: unknown) => void) => {
      const listener = (_e: IpcRendererEvent, s: unknown) => cb(s);
      ipcRenderer.on('bee:status', listener);
      return () => ipcRenderer.removeListener('bee:status', listener);
    },
  },
};

contextBridge.exposeInMainWorld('innerlume', api);

export type InnerlumeApi = typeof api;
