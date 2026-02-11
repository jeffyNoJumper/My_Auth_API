const { contextBridge, ipcRenderer } = require('electron');

// This exposes 'window.api' to ui.js
contextBridge.exposeInMainWorld('api', {
    // 1. Get the HWID from C++
    getMachineIdentifier: () => ipcRenderer.invoke('get-hwid'),

    // 2. Trigger the C++ Spoofer
    startSpoof: () => ipcRenderer.invoke('start-spoof'),

    // 3. Launch the game/cheat
    launchCheat: (gameName) => ipcRenderer.send('launch-game', gameName),

    // 4. Update Check (for the Auto-Updater)
    checkUpdates: () => ipcRenderer.invoke('check-for-updates')
});
