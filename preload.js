const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {

    getMachineIdentifier: () => ipcRenderer.invoke('get-hwid'),
    startSpoof: () => ipcRenderer.invoke('start-spoof'),
    launchCheat: (gameName) => ipcRenderer.invoke('launch-game', gameName),

    close: () => ipcRenderer.send('window-close'),
    minimize: () => ipcRenderer.send('window-minimize'),

    // --- Auto-Updater Listeners (Main.js -> UI.js) ---
    onUpdateAvailable: (callback) => 
        ipcRenderer.on('update-available', (event, version) => callback(version)),
        
    onDownloadProgress: (callback) => 
        ipcRenderer.on('download-progress', (event, percent) => callback(percent)),
        
    onUpdateReady: (callback) => 
        ipcRenderer.on('update-ready', (event) => callback())
});
