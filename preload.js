const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // --- Existing C++ & Window Logic ---
    getMachineIdentifier: () => ipcRenderer.invoke('get-hwid'),
    startSpoof: () => ipcRenderer.invoke('start-spoof'),
    launchCheat: (gameName) => ipcRenderer.invoke('launch-game', gameName),
    close: () => ipcRenderer.send('window-close'),
    minimize: () => ipcRenderer.send('window-minimize'),

    // --- NEW: Update & News Functionality ---
    startUpdateDownload: () => ipcRenderer.invoke('start-update-download'),
    getNews: () => ipcRenderer.invoke('get-news'),

    // --- Auto-Updater Listeners (Main.js -> UI.js) ---
    // Updated to receive version AND news/release notes from GitHub
    onUpdateAvailable: (callback) =>
        ipcRenderer.on('update-available', (event, data) => callback(data)),

    onDownloadProgress: (callback) =>
        ipcRenderer.on('download-progress', (event, percent) => callback(percent)),

    onUpdateReady: (callback) =>
        ipcRenderer.on('update-ready', (event) => callback())
});
