const { contextBridge, ipcRenderer, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

contextBridge.exposeInMainWorld('api', {
    launchCheat: (name, close, key, type) => {
        console.log("[PRELOAD] Forwarding Key:", key); // This will show in DevTools
        return ipcRenderer.invoke('launch-game', name, close, key, type);
    },

    toggleStreamProof: (enabled) => ipcRenderer.send('toggle-stream-proof', enabled),
    toggleDiscord: (enabled) => ipcRenderer.send('toggle-discord', enabled),
    getNews: () => ipcRenderer.invoke('get-news'),

    startSpoof: (options) => ipcRenderer.invoke('start-spoof', options),
    getMachineID: () => ipcRenderer.invoke('get-machine-id'),
    getBaseboard: () => ipcRenderer.invoke('get-baseboard'),
    getGPUID: () => ipcRenderer.invoke('get-gpuid'),

    close: () => ipcRenderer.send('window-close'),
    minimize: () => ipcRenderer.send('window-minimize'),

    // VERSION CHECK (uses raw JSON file)
    checkVersion: async (currentVersion) => {
        try {
            const response = await fetch(
                'https://raw.githubusercontent.com/jeffyNoJumper/My_Auth_API/main/version.txt'
            );

            if (!response.ok) {
                throw new Error(`Version fetch failed (HTTP ${response.status})`);
            }

            const text = await response.text();

            // Prevent HTML page being parsed as JSON
            if (text.trim().startsWith('<!DOCTYPE')) {
                throw new Error('Received HTML instead of JSON. Check RAW URL.');
            }

            const latest = JSON.parse(text);

            // No version mismatch → no update
            if (!latest.version || latest.version === currentVersion) {
                return null;
            }

            // Ensure download URL exists
            if (!latest.url) {
                console.log('Update found but no URL provided.');
                return null;
            }

            const headCheck = await fetch(latest.url, { method: 'HEAD' });

            if (!headCheck.ok) {
                console.log('Update asset not ready yet.');
                return null;
            }

            return latest;

        } catch (err) {
            console.error('Version check failed:', err.message);
            return null;
        }
    },

    // DOWNLOAD UPDATE
    downloadUpdate: async (url) => {
        try {
            const res = await fetch(url);
            

            if (!res.ok) {
                throw new Error(`Download failed (HTTP ${res.status})`);
            }

            const buffer = Buffer.from(await res.arrayBuffer());

            if (buffer.slice(0, 2).toString() !== 'MZ') {
                throw new Error('Downloaded file is not a valid Windows executable.');
            }

            const downloadsPath = path.join(os.homedir(), 'Downloads');
            const tmpPath = path.join(downloadsPath, 'SK_ALL-IN-ONE-UPDATE.exe');

            fs.writeFileSync(tmpPath, buffer);
            return tmpPath;

        } catch (err) {
            console.error('Download failed:', err.message);
            throw err;
        }
    },

    runUpdate: (filePath) => {
        shell.openPath(filePath);
    },

    openExternal: (url) => shell.openExternal(url)
});
