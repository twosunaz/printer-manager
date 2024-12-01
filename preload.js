const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  onPrintersList: (callback) => ipcRenderer.on('printers-list', (event, printers) => callback(printers)),
  registerPrinter: (data) => ipcRenderer.send('register-printer', data),
  goLive: (data) => ipcRenderer.send('go-live', data), // New function for "Go Live"
  onServerResponse: (callback) => ipcRenderer.on('server-response', (event, response) => callback(response)),
});
