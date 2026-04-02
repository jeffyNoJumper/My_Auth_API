const { contextBridge, ipcRenderer, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

const VERSION_MANIFEST_URL = "https://raw.githubusercontent.com/jeffyNoJumper/My_Auth_API/refs/heads/main/version.txt";

function normalizeManifestText(rawText) {
    return String(rawText || "")
        .replace(/^\uFEFF/, '')
        .trim()
        .replace(/;(\s*[}\]])/g, '$1');
}

function buildManifestName(url, version) {
    if (url) {
        const lastPathSegment = url.split('/').pop() || '';
        const cleanName = lastPathSegment.split('?')[0];
        if (cleanName) {
            return decodeURIComponent(cleanName);
        }
    }

    return `VEXION.ALL-IN-ONE.Setup.${String(version || '').replace(/^v/i, '')}.exe`;
}

function parseVersionManifest(rawText) {
    const normalizedText = normalizeManifestText(rawText);
    if (!normalizedText) {
        throw new Error("Version manifest was empty");
    }

    let parsed;
    try {
        parsed = JSON.parse(normalizedText);
    } catch (error) {
        throw new Error("Version manifest is not valid JSON");
    }

    const version = String(parsed.version || '').trim().replace(/^v/i, '');
    const url = typeof parsed.url === 'string' ? parsed.url.trim() : "";
    const name = typeof parsed.name === 'string' && parsed.name.trim()
        ? parsed.name.trim()
        : buildManifestName(url, version);

    if (!version) {
        throw new Error("Version manifest is missing a version field");
    }

    return {
        version,
        url,
        name
    };
}

async function fetchVersionManifest() {
    const res = await fetch(VERSION_MANIFEST_URL, { cache: 'no-store' });
    if (!res.ok) {
        throw new Error(`Failed to fetch version manifest (${res.status})`);
    }

    const manifestText = await res.text();
    return parseVersionManifest(manifestText);
}

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
    setDiscordActivity: (payload) => ipcRenderer.send('set-discord-activity', payload),
    getNews: () => ipcRenderer.invoke('get-news'),
    checkVersion: () => ipcRenderer.invoke('check-version'),
    startSpoof: (options) => ipcRenderer.invoke('start-spoof', options),
    getHardwareSnapshot: (forceRefresh = false) => ipcRenderer.invoke('get-hardware-snapshot', { forceRefresh }),
    getMachineID: () => ipcRenderer.invoke('get-machine-id'),
    getBaseboard: () => ipcRenderer.invoke('get-baseboard'),
    getGPUID: () => ipcRenderer.invoke('get-gpuid'),
    getSerial: () => ipcRenderer.invoke("getSerial"),
    getGPU: () => ipcRenderer.invoke("getGPU"),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    getGameModuleAvailability: (gameName) => ipcRenderer.invoke('get-game-module-availability', gameName),
    getGameLiveFeed: (gameName) => ipcRenderer.invoke('get-game-live-feed', gameName),
    close: () => ipcRenderer.send('window-close'),
    minimize: () => ipcRenderer.send('window-minimize'),
    setAuthWindow: () => ipcRenderer.send('loader-window-auth'),
    setAppWindow: () => ipcRenderer.send('loader-window-expand'),
    resetAuthShell: () => ipcRenderer.send('loader-reset-auth-shell'),
    openExternal: (url) => shell.openExternal(url),
    showSystemNotification: (title, body) => ipcRenderer.invoke('show-system-notification', { title, body }),

    // ---------- UPDATE SYSTEM ----------
    getLatestRelease: fetchVersionManifest,

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
