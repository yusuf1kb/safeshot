'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');
const { pathToFileURL } = require('url');

contextBridge.exposeInMainWorld('safeshot', {
  info: () => ipcRenderer.invoke('app:info'),
  pickFiles: () => ipcRenderer.invoke('file:pick'),
  fileInfo: (file) => ipcRenderer.invoke('file:info', file),
  exportImage: (job) => ipcRenderer.invoke('export', job),
  pickExportPath: (file, format) => ipcRenderer.invoke('export:pick', file, format),
  register: () => ipcRenderer.invoke('shell:register'),
  unregister: () => ipcRenderer.invoke('shell:unregister'),
  shellStatus: () => ipcRenderer.invoke('shell:status'),
  showInFolder: (file) => ipcRenderer.invoke('folder:open', file),
  toFileUrl: (p) => pathToFileURL(p).href,
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch (_) {
      return null;
    }
  },
  onOpenFiles: (cb) => {
    const handler = (_e, files) => cb(files);
    ipcRenderer.on('open-files', handler);
    return () => ipcRenderer.removeListener('open-files', handler);
  },
  takePendingFiles: () => ipcRenderer.invoke('files:take'),
});
