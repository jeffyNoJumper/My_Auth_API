const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    launchCheat: (gameName, autoClose) => ipcRenderer.invoke('launch-game', gameName, autoClose),
    toggleStreamProof: (enabled) => ipcRenderer.send('toggle-stream-proof', enabled),
    toggleDiscord: (enabled) => ipcRenderer.send('toggle-discord', enabled),
    getNews: () => ipcRenderer.invoke('get-news'),

    // Spoofer Functions (Correctly routed via IPC)
    startSpoof: (options) => ipcRenderer.invoke('start-spoof', options),
    getMachineID: () => ipcRenderer.invoke('get-machine-id'),
    getBaseboard: () => ipcRenderer.invoke('get-baseboard'),
    getGPUID: () => ipcRenderer.invoke('get-gpuid'),

    // Window Controls
    close: () => ipcRenderer.send('window-close'),
    minimize: () => ipcRenderer.send('window-minimize'),

    // Update Listeners
    onUpdateAvailable: (callback) => {
        ipcRenderer.removeAllListeners('update-available');
        ipcRenderer.on('update-available', (event, data) => callback(data));
    },
    onDownloadProgress: (callback) =>
        ipcRenderer.on('download-progress', (event, percent) => callback(percent)),
    onUpdateReady: (callback) =>
        ipcRenderer.on('update-ready', (event) => callback())
});
