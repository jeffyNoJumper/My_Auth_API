const { contextBridge, ipcRenderer, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

contextBridge.exposeInMainWorld('api', {

    launchCheat: (name, close, key, type, userData) => {
        console.log("[PRELOAD] Forwarding Key:", key);
        console.log("[PRELOAD] Forwarding userData:", userData);

        return ipcRenderer.invoke(
            "launch-game",
            name,
            close,
            key,
            type,
            userData
        );
    },
    toggleStreamProof: (enabled) => ipcRenderer.send('toggle-stream-proof', enabled),
    onApplyStreamProof: (callback) => ipcRenderer.on('apply-stream-proof', (event, enabled) => callback(enabled)),
    toggleDiscord: (enabled) => ipcRenderer.send('toggle-discord', enabled),
    getNews: () => ipcRenderer.invoke('get-news'),
    getLatestRelease: () => ipcRenderer.invoke('get-latest-release'),
    downloadUpdate: (url, fileName) => ipcRenderer.invoke('download-update', url, fileName),
    runUpdate: (filePath) => ipcRenderer.invoke('run-update', filePath),

    checkVersion: () => ipcRenderer.invoke('check-version'),

    startSpoof: (options) => ipcRenderer.invoke('start-spoof', options),
    getHardwareSnapshot: (forceRefresh = false) => ipcRenderer.invoke('get-hardware-snapshot', { forceRefresh }),
    getMachineID: () => ipcRenderer.invoke('get-machine-id'),
    getBaseboard: () => ipcRenderer.invoke('get-baseboard'),
    getGPUID: () => ipcRenderer.invoke('get-gpuid'),
    getSerial: () => ipcRenderer.invoke("getSerial"),
    getGPU: () => ipcRenderer.invoke("getGPU"),

    close: () => ipcRenderer.send('window-close'),
    minimize: () => ipcRenderer.send('window-minimize'),

    // ---------- UPDATE SYSTEM ----------

    getLatestRelease: async () => {
        const res = await fetch("https://api.github.com/repos/jeffyNoJumper/My_Auth_API/releases/latest");
        if (!res.ok) throw new Error("Failed to fetch latest release");

        const data = await res.json();
        const exe = data.assets.find(a => a.name.endsWith(".exe"));

        if (!exe) throw new Error("No executable found in release");

        return {
            version: data.tag_name,
            url: exe.browser_download_url,
            name: exe.name
        };
    },

    downloadUpdate: async (url, fileName) => {

        const res = await fetch(url);
        if (!res.ok) throw new Error(`Download failed (${res.status})`);

        const buffer = Buffer.from(await res.arrayBuffer());

        const downloads = path.join(os.homedir(), "Downloads");
        const savePath = path.join(downloads, fileName);

        fs.writeFileSync(savePath, buffer);

        return savePath;
    },

    runUpdate: (filePath) => {
        shell.openPath(filePath);
    }

});
