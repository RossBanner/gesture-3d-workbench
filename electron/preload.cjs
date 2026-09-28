const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('workbench', Object.freeze({
  saveScene: (text) => ipcRenderer.invoke('scene:save', text),
  openScene: () => ipcRenderer.invoke('scene:open'),
  cameraAccess: (enabled) => ipcRenderer.invoke('camera:access', enabled)
}));
