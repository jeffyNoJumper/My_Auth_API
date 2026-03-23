const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const crypto = require('crypto');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { execFile, exec, spawn } = require('child_process');
const fs = require('fs');
const axios = require('axios');
const { promisify } = require('util');

const exePath = path.join(__dirname, 'bin', 'Volumeid64.exe');

const newID = "12AB-34CD";

let mainWindow
let spoofer
const RPC = require('discord-rpc');
const CLIENT_ID = '1476724607485743277';
let rpcClient = null;
const execFileAsync = promisify(execFile);
let hardwareSnapshotCache = null;
let hardwareSnapshotPromise = null;
const GAME_FEED_TTL_MS = 5 * 60 * 1000;
const gameFeedCache = new Map();

app.on('will-quit', async () => {
    if (rpcClient) {
        try {
            // THE FINAL WIPE
            await rpcClient.clearActivity().catch(() => { });
            await rpcClient.destroy().catch(() => { });
            console.log("💀 Ghost Status Purged on Exit");
        } catch (e) { }
    }
});

async function changeVolumeID() {

    const hwid = await spoofer.getMachineID(); // or window.api.getMachineID()

    // remove dashes and uppercase
    const clean = hwid.replace(/-/g, "").toUpperCase();

    // take first 8 hex chars
    const volumeID = clean.slice(0, 4) + "-" + clean.slice(4, 8);

    const exePath = path.join(__dirname, 'bin', 'Volumeid64.exe');

    execFile(exePath, ["C:", volumeID], { windowsHide: true }, (err, stdout, stderr) => {

        if (err) {
            console.error("VolumeID Failed:", err);
            return;
        }

        console.log("VolumeID Changed To:", volumeID);
    });
}

function hwidToVolumeID(hwid) {

    const hash = crypto.createHash("md5")
        .update(hwid)
        .digest("hex")
        .toUpperCase();

    return hash.slice(0, 4) + "-" + hash.slice(4, 8);
}

function quickAdd(days) {
    console.log(`[DEBUG] Quick Add Triggered: +${days}D`);
    modifyKey('add-time', days);
}

function resetHardwareSnapshot() {
    hardwareSnapshotCache = null;
    hardwareSnapshotPromise = null;
}

function parseCommandValue(output, headerName) {
    const lines = output
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

    if (!lines.length) {
        return "UNKNOWN";
    }

    if (!headerName) {
        return lines[1] || lines[0] || "UNKNOWN";
    }

    const match = lines.find(line => line.includes(headerName));
    if (!match) {
        return "UNKNOWN";
    }

    const parts = match.split(/\s+/);
    return parts[parts.length - 1] || "UNKNOWN";
}

async function readMachineGuid() {
    try {
        const { stdout } = await execFileAsync(
            'reg',
            ['query', 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
            { encoding: 'utf8', windowsHide: true }
        );

        return parseCommandValue(stdout, 'MachineGuid') || "GUID_NOT_FOUND";
    } catch (err) {
        console.error("[HWID READ ERROR]", err);
        return "REG_ACCESS_FAILED";
    }
}

async function readDiskSerial() {
    try {
        const { stdout } = await execFileAsync(
            'wmic',
            ['diskdrive', 'get', 'serialnumber'],
            { encoding: 'utf8', windowsHide: true }
        );

        return parseCommandValue(stdout);
    } catch (err) {
        console.error("[SERIAL READ ERROR]", err);
        return "UNKNOWN";
    }
}

async function readGpuId() {
    try {
        const { stdout } = await execFileAsync(
            'wmic',
            ['path', 'win32_VideoController', 'get', 'PNPDeviceID'],
            { encoding: 'utf8', windowsHide: true }
        );

        return parseCommandValue(stdout);
    } catch (err) {
        console.error("[GPU READ ERROR]", err);
        return "UNKNOWN";
    }
}

async function getHardwareSnapshot(options = {}) {
    const { forceRefresh = false } = options;

    if (forceRefresh) {
        resetHardwareSnapshot();
    }

    if (hardwareSnapshotCache) {
        return hardwareSnapshotCache;
    }

    if (!hardwareSnapshotPromise) {
        hardwareSnapshotPromise = Promise.all([
            readMachineGuid(),
            readDiskSerial(),
            readGpuId()
        ])
            .then(([machineId, serial, gpu]) => {
                hardwareSnapshotCache = { machineId, serial, gpu };
                return hardwareSnapshotCache;
            })
            .finally(() => {
                hardwareSnapshotPromise = null;
            });
    }

    return hardwareSnapshotPromise;
}

function startSecurityMonitor() {
    const blacklist = [
        "x64dbg", "wireshark", "processhacker", "httpdebugger",
        "fiddler", "dnspy", "vboxservice", "ghidra",
        "ida64", "idaw", "ollydng", "cheatengine"
    ];

    setInterval(() => {
        if (process.execArgv.some(arg => arg.includes('--inspect') || arg.includes('--debug'))) {
            triggerReaction("Debugger Attachment Detected");
        }

        exec('tasklist', (err, stdout) => {
            if (err) return;
            const activeProcess = stdout.toLowerCase();

            blacklist.forEach(tool => {
                if (activeProcess.includes(tool.toLowerCase())) {
                    triggerReaction(`Unauthorized Tool: ${tool}`);
                }
            });
        });
    }, 2000);
}

try {
    spoofer = require('./build/Release/spoofer.node');
    console.log("SUCCESS: C++ Spoofer Addon loaded.");
} catch (e) {
    console.error("CRITICAL: Failed to load C++ Spoofer Addon.", e);
    spoofer = {
        getMachineID: () => "MODULE_LOAD_FAIL",
        getBaseboard: () => "MODULE_LOAD_FAIL",
        getGPUID: () => "MODULE_LOAD_FAIL",
        runSpoofer: (cb) => cb(null, { disk: false, guid: false })
    };
}

app.setAppUserModelId("com.sk.allinone");

// --- 1. WINDOW SETUP ---
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 980,
        height: 780,
        frame: false,
        resizable: false,
        transparent: true,
        center: true,
        icon: path.join(__dirname, 'imgs/VEXION.ico'),
        // backgroundColor: '#050505', 
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            partition: 'persist:sk_loader',
            backgroundThrottling: true,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    mainWindow.loadFile('index.html');

    mainWindow.once('ready-to-show', () => {
        if (process.env.ENABLE_NATIVE_UPDATER === 'true') {
            autoUpdater.checkForUpdatesAndNotify();
        } else {
            console.log("[UPDATER] Native updater disabled. Loader will use the custom manifest-based update flow.");
        }
        mainWindow.center(); 
        mainWindow.show();
    });
}

// --- IPC HANDLERS ---
ipcMain.on('window-close', () => {
    app.quit();
});

ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

ipcMain.handle('start-spoof', async (event, options) => {

    const crypto = require('crypto');
    const brandNewGUID = crypto.randomUUID();

    const safeOptions = {

        motherboard: options?.motherboard || "Other",

        disk: Boolean(options?.disk ?? true),
        guid: Boolean(options?.guid ?? true),
        kernel: Boolean(options?.kernel ?? true),
        user: Boolean(options?.user ?? true),

        cleanReg: Boolean(options?.cleanReg ?? true),
        cleanDisk: Boolean(options?.cleanDisk ?? true),
        biosFlash: Boolean(options?.biosFlash ?? false),

        deepClean: Boolean(options?.deepClean ?? false),

        newMachineGuid: String(brandNewGUID)
    };

    console.log("[MAIN] Spoof Config (Deep Clean: " + safeOptions.deepClean + "):", safeOptions);

    try {

        // ---------------- LOAD KERNEL DRIVER ----------------

        if (safeOptions.kernel) {

            const basePath = app.isPackaged
                ? process.resourcesPath
                : __dirname;

            const kdmapperPath = path.join(basePath, "assets", "kdmapper_Release.exe");
            const driverPath = path.join(basePath, "assets", "km.sys");

            console.log("[MAIN] Launching kdmapper...");

            await runKDMapper(kdmapperPath, driverPath);

            console.log("[MAIN] Kernel driver mapped successfully");

        }

        // ---------------- RUN SPOOFER ----------------

        return await new Promise((resolve) => {

            console.log(`[MAIN] Writing Registry ID: ${safeOptions.newMachineGuid}`);

            spoofer.runSpoofer(safeOptions, async (err, results) => {

                if (err) {

                    console.error("[MAIN] C++ Error:", err);

                    resolve({ success: false });

                    return;

                }

                try {

                    if (safeOptions.deepClean) {

                        console.log("[MAIN] Deep Clean Enabled → Running VolumeID Mutation");

                        await changeVolumeID();

                    }

                } catch (volumeError) {

                    console.error("[MAIN] VolumeID Error:", volumeError);

                }

                resetHardwareSnapshot();

                resolve({
                    success: true,
                    newHwid: brandNewGUID,
                    motherboard: safeOptions.motherboard,
                    ...results
                });

            });

        });

    } catch (crash) {

        console.error("[MAIN] Fatal Crash:", crash);

        return {
            success: false,
            error: "MAIN_CRASH"
        };

    }
    function runKDMapper(mapperPath, driverPath) {

        return new Promise((resolve, reject) => {

            const proc = spawn(mapperPath, [driverPath], {
                windowsHide: true
            });

            proc.stdout.on("data", data => {
                console.log("[KDMAPPER]", data.toString());
            });

            proc.stderr.on("data", data => {
                console.error("[KDMAPPER ERROR]", data.toString());
            });

            proc.on("error", err => {
                console.error("[KDMAPPER SPAWN ERROR]", err);
                reject(err);
            });

            proc.on("close", code => {

                console.log("[KDMAPPER] Exit Code:", code);

                if (code === 0)
                    resolve();
                else
                    reject(new Error("kdmapper failed"));

            });

        });

    }
});

ipcMain.handle('check-version', async () => {
    return {
        version: app.getVersion(),
        url: 'https://raw.githubusercontent.com/jeffyNoJumper/My_Auth_API/refs/heads/main/version.txt'
    };
});

ipcMain.handle('get-latest-release', async () => {
    const res = await axios.get("https://github.com/jeffyNoJumper/My_Auth_API/releases/download/v1.1.2/VEXION.ALL-IN-ONE.Setup.1.1.2.exe");
    const exe = res.data.assets.find(a => a.name.endsWith(".exe"));
    return {
        version: res.data.tag_name,
        url: exe ? exe.browser_download_url : null,
        name: exe ? exe.name : null
    };
});

ipcMain.handle('download-update', async (event, url, fileName) => {
    const response = await axios({ url, method: 'GET', responseType: 'arraybuffer' });
    const downloads = path.join(os.homedir(), "Downloads");
    const savePath = path.join(downloads, fileName);

    fs.writeFileSync(savePath, Buffer.from(response.data));
    return savePath; // Returns the string path to ui.js
});

ipcMain.handle('run-update', async (event, filePath) => {
    shell.openPath(filePath);
    app.quit();
});

function updateRPCStatus(gameName) {
    if (rpcClient && rpcClient.transport.socket) {
        rpcClient.setActivity({
            details: `Gaming: ${gameName}`,
            state: 'Status: Undetected',
            startTimestamp: new Date(),
            largeImageKey: 'logo',
            instance: false,
        }).catch(() => console.log("⚠️ RPC Update Failed"));
        console.log(`[RPC] Status updated to: ${gameName}`);
    }
}

function isCS2Running() {
    return new Promise((resolve) => {
        exec('tasklist /FI "IMAGENAME eq cs2.exe"', (err, stdout) => {
            if (err) return resolve(false);
            resolve(stdout.toLowerCase().includes("cs2.exe"));
        });
    });
}

function waitForCS2() {
    return new Promise((resolve) => {

        const interval = setInterval(() => {

            exec('tasklist /FI "IMAGENAME eq cs2.exe"', (err, stdout) => {

                if (stdout.toLowerCase().includes("cs2.exe")) {
                    clearInterval(interval);
                    resolve(true);
                }

            });

        }, 300); // check every 3 seconds
    });
}

const gameAssetAliases = {
    CS2: ['cs2', 'counter-strike', 'counter strike', 'counterstrike'],
    FIVEM: ['fivem', 'cfx'],
    GTAV: ['gtav', 'gta v', 'gta5', 'gta'],
    WARZONE: ['warzone', 'call of duty', 'cod', 'mw3', 'mwii']
};

const gameAssetDirectories = {
    CS2: ['cs2', 'counter-strike-2'],
    FIVEM: ['fivem'],
    GTAV: ['gtav', 'gta-v'],
    WARZONE: ['warzone']
};

function normalizeLaunchGameName(gameName = "") {
    const value = String(gameName || "").trim().toUpperCase();

    switch (value) {
        case "FIVEM":
            return "FIVEM";
        case "GTA V":
        case "GTAV":
            return "GTAV";
        case "WARZONE":
            return "WARZONE";
        case "CS2":
            return "CS2";
        default:
            return value;
    }
}

function getLaunchGameLabel(gameName) {
    const normalized = normalizeLaunchGameName(gameName);

    switch (normalized) {
        case "FIVEM":
            return "FiveM";
        case "GTAV":
            return "GTA V";
        case "WARZONE":
            return "Warzone";
        case "CS2":
            return "CS2";
        default:
            return String(gameName || normalized);
    }
}

function getModuleExtension(injectionType) {
    return injectionType === "internal" || injectionType === "dll" ? ".dll" : ".exe";
}

function isUsableModuleAsset(fileName, targetExt) {
    const name = String(fileName || "").toLowerCase();
    const ext = path.extname(name);

    if (ext !== targetExt) {
        return false;
    }

    return !name.includes('extreme injector')
        && !name.includes('volumeid')
        && !name.includes('kdmapper')
        && !name.endsWith('.sys')
        && !name.endsWith('.ini')
        && !name.endsWith('.xml')
        && !name.endsWith('.blockmap');
}

function getGameAssetSearchPaths(assetsPath, gameName) {
    const normalized = normalizeLaunchGameName(gameName);
    const directories = [assetsPath, ...(gameAssetDirectories[normalized] || [normalized.toLowerCase()])]
        .map((entry) => entry === assetsPath ? entry : path.join(assetsPath, entry))
        .filter((entry, index, array) => array.indexOf(entry) === index);

    return directories.filter((entry) => {
        try {
            return fs.existsSync(entry) && fs.statSync(entry).isDirectory();
        } catch {
            return false;
        }
    });
}

function collectModuleCandidates(assetsPath, gameName, injectionType) {
    const targetExt = getModuleExtension(injectionType);
    const searchPaths = getGameAssetSearchPaths(assetsPath, gameName);
    const candidates = [];

    searchPaths.forEach((directory) => {
        fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
            if (!entry.isFile() || !isUsableModuleAsset(entry.name, targetExt)) {
                return;
            }

            const fullPath = path.join(directory, entry.name);
            candidates.push({
                fileName: entry.name,
                fullPath,
                relativePath: path.relative(assetsPath, fullPath)
            });
        });
    });

    return candidates;
}

function resolveModuleAsset(assetsPath, gameName, injectionType) {
    const normalized = normalizeLaunchGameName(gameName);
    const aliases = gameAssetAliases[normalized] || [normalized.toLowerCase()];
    const candidates = collectModuleCandidates(assetsPath, gameName, injectionType);

    const aliasMatch = candidates.find((file) => {
        const lower = file.fileName.toLowerCase();
        return aliases.some((alias) => lower.includes(alias));
    });

    if (aliasMatch) {
        return aliasMatch;
    }

    if (normalized === "CS2") {
        const fallbackName = getModuleExtension(injectionType) === ".dll" ? "vexion menu.dll" : "vexion menu.exe";
        return candidates.find((file) => file.fileName.toLowerCase() === fallbackName) || null;
    }

    return null;
}

function getModuleAvailability(assetsPath, gameName) {
    return {
        game: normalizeLaunchGameName(gameName),
        hasInternal: Boolean(resolveModuleAsset(assetsPath, gameName, "internal")),
        hasExternal: Boolean(resolveModuleAsset(assetsPath, gameName, "external"))
    };
}

function resolveSharedToolPath(assetsPath, fileName) {
    const candidates = [
        path.join(assetsPath, 'tools', fileName),
        path.join(assetsPath, fileName)
    ];

    return candidates.find((entry) => fs.existsSync(entry)) || candidates[0];
}

function stripFeedMarkup(value = "") {
    return String(value || "")
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/\s+/g, ' ')
        .trim();
}

function formatFeedStamp(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "Live";
    }

    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

async function fetchSteamNewsFeed(appId, gameLabel) {
    const url = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${appId}&count=1&maxlength=180&format=json`;
    const res = await fetch(url, { headers: { 'User-Agent': 'VEXION-Loader/1.0' } });

    if (!res.ok) {
        throw new Error(`Steam feed failed (${res.status})`);
    }

    const data = await res.json();
    const item = data?.appnews?.newsitems?.[0];

    if (!item) {
        throw new Error(`Steam feed missing news for ${gameLabel}`);
    }

    return {
        title: stripFeedMarkup(item.title) || `${gameLabel} feed updated`,
        summary: stripFeedMarkup(item.contents) || `Latest ${gameLabel} headline pulled from Steam News.`,
        meta: `${stripFeedMarkup(item.feedlabel || item.feedname || 'Steam News')} · ${formatFeedStamp((item.date || 0) * 1000)}`,
        url: item.url || `https://store.steampowered.com/news/app/${appId}`
    };
}

async function fetchFiveMStatusFeed() {
    const res = await fetch('https://status.cfx.re/api/v2/summary.json', { headers: { 'User-Agent': 'VEXION-Loader/1.0' } });

    if (!res.ok) {
        throw new Error(`FiveM status feed failed (${res.status})`);
    }

    const data = await res.json();
    const component = data?.components?.find((entry) => entry.name === 'Games')
        || data?.components?.find((entry) => entry.name === 'CnL')
        || data?.components?.[0];

    if (!component) {
        throw new Error('FiveM status feed missing components');
    }

    const titleStatus = String(component.status || 'unknown').replace(/_/g, ' ').toUpperCase();

    return {
        title: `FiveM ${component.name}: ${titleStatus}`,
        summary: stripFeedMarkup(component.description) || 'Live operational status pulled from Cfx.re.',
        meta: `Cfx.re Status · ${formatFeedStamp(data?.page?.updated_at || component.updated_at)}`,
        url: 'https://status.cfx.re'
    };
}

async function fetchWarzoneFeed() {
    const res = await fetch('https://www.callofduty.com/blog/warzone', { headers: { 'User-Agent': 'VEXION-Loader/1.0' } });

    if (!res.ok) {
        throw new Error(`Warzone feed failed (${res.status})`);
    }

    const text = await res.text();
    const match = text.match(/<a href=\"(\/(?:blog|patchnotes)\/[^\"]*warzone[^\"]*)\">\s*([^<]{12,200})\s*<\/a>/i);

    if (!match) {
        throw new Error('Warzone feed missing headline');
    }

    return {
        title: stripFeedMarkup(match[2]),
        summary: 'Latest official Warzone post detected from the Call of Duty site.',
        meta: `Call of Duty Blog · ${formatFeedStamp(Date.now())}`,
        url: new URL(match[1], 'https://www.callofduty.com').toString()
    };
}

async function fetchGameFeed(gameName) {
    switch (normalizeLaunchGameName(gameName)) {
        case 'CS2':
            return fetchSteamNewsFeed(730, 'CS2');
        case 'GTAV':
            return fetchSteamNewsFeed(271590, 'GTA V');
        case 'FIVEM':
            return fetchFiveMStatusFeed();
        case 'WARZONE':
            return fetchWarzoneFeed();
        default:
            return {
                title: `${getLaunchGameLabel(gameName)} feed unavailable`,
                summary: 'No live source is configured for this title yet.',
                meta: 'Offline fallback',
                url: ''
            };
    }
}

ipcMain.handle('get-game-module-availability', async (event, gameName) => {
    const assetsPath = path.join(__dirname, '..', 'assets');

    if (!fs.existsSync(assetsPath)) {
        return { game: normalizeLaunchGameName(gameName), hasInternal: false, hasExternal: false };
    }

    return getModuleAvailability(assetsPath, gameName);
});

ipcMain.handle('get-game-live-feed', async (event, gameName) => {
    const cacheKey = normalizeLaunchGameName(gameName);
    const cached = gameFeedCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
    }

    try {
        const value = await fetchGameFeed(gameName);
        gameFeedCache.set(cacheKey, {
            value,
            expiresAt: Date.now() + GAME_FEED_TTL_MS
        });
        return value;
    } catch (error) {
        console.error(`[GAME FEED ERROR] ${cacheKey}`, error);

        if (cached?.value) {
            return cached.value;
        }

        return {
            title: `${getLaunchGameLabel(gameName)} feed unavailable`,
            summary: 'The official feed could not be reached right now.',
            meta: 'Offline fallback',
            url: ''
        };
    }
});

ipcMain.handle('launch-game', async (event, gameName, autoClose, licenseKey, injectionType, userData) => {

    console.log("[LAUNCH] Received userData:", userData);

    const finalType = injectionType === "dll" ? "internal" : (injectionType || "external");
    const normalizedGame = normalizeLaunchGameName(gameName);
    const gameLabel = getLaunchGameLabel(gameName);
    const assetsPath = path.join(__dirname, '..', 'assets');

    function getDaysRemaining(expiry) {
        if (!expiry) return "Unknown";

        const now = new Date();
        const exp = new Date(expiry);
        const diff = exp - now;

        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

        if (days <= 0) return "Expired";
        if (days > 3650) return "Lifetime";

        return `${days} days`;
    }

    try {
        if (!fs.existsSync(assetsPath)) {
            return { status: "Error", message: "Assets folder missing!" };
        }

        const moduleAsset = resolveModuleAsset(assetsPath, gameName, finalType);

        if (!moduleAsset) {
            const missingType = finalType === "internal" ? "internal DLL" : "external EXE";
            const folderName = normalizeLaunchGameName(gameName).toLowerCase().replace(/\s+/g, '-');
            return { status: "Error", message: `No ${gameLabel} ${missingType} module was found in assets/${folderName}.` };
        }

        const injectorPath = resolveSharedToolPath(assetsPath, 'Extreme Injector v3.exe');
        const cheatPath = moduleAsset.fullPath;

        const { spawn, exec } = require("child_process");

        if (finalType === "internal") {
            if (!fs.existsSync(injectorPath)) {
                return { status: "Error", message: "Extreme Injector v3.exe is missing from assets." };
            }

            if (normalizedGame === "CS2") {
                const running = await isCS2Running();

                if (!running) {

                    exec('start "" "steam://rungameid/730"');

                    await waitForCS2();
                }
            }

            spawn(injectorPath, [], {
                cwd: assetsPath,
                detached: true,
                stdio: "ignore",
                windowsHide: true
            }).unref();

            return {
                status: "Success",
                message: normalizedGame === "CS2"
                    ? `${moduleAsset.relativePath} injector opened for CS2.`
                    : `Internal injector opened for ${gameLabel}. Attach ${moduleAsset.relativePath} after ${gameLabel} is running.`
            };
        }

        if (finalType === "external") {

            const uName = userData?.username ?? "Unknown";
            const uSub = userData?.subscription ?? "Unknown";
            const uExp = getDaysRemaining(userData?.expiry);

            const launchData = `${uName}|${uSub}|${uExp}`;

            const externalCmd = `powershell -Command "& '${cheatPath}' '${launchData}'"`;

            require('child_process').exec(externalCmd, { shell: true }, (err) => {
                if (err) console.error("[EXTERNAL ERROR]", err.message);
            });

            if (rpcClient) {
                rpcClient.setActivity({
                    details: `Playing ${gameLabel.toUpperCase()}`,
                    state: '🛡️ [STATUS_UNDETECTED]',
                    startTimestamp: new Date(),
                    largeImageKey: 'logo',
                }).catch(() => { });
            }

            if (autoClose) {
                setTimeout(() => { app.quit(); }, 3000);
            }

            return { status: "Success", message: `${gameLabel} external module (${moduleAsset.relativePath}) launched successfully!` };
        }

        return { status: "Error", message: `Unknown launch type requested for ${gameLabel}.` };

    } catch (err) {
        console.error("[LAUNCH CRASH]", err);
        return { status: "Error", message: "Failed to communicate with loader assets." };
    }
});




ipcMain.on('toggle-stream-proof', (event, enabled) => {
    if (mainWindow) {
        // Just send a message back to the UI to hide specific elements
        mainWindow.webContents.send('apply-stream-proof', enabled);
        console.log(`[MAIN] UI Stream Proof Mode: ${enabled ? 'ON' : 'OFF'}`);
    }
});



// Add 'gameName' as a second parameter (it will be null when toggling from settings)
ipcMain.on('toggle-discord', async (event, enabled, gameName = null) => {

    // 1. If turning OFF (Standard Toggle)
    if (!enabled) {
        if (rpcClient) {
            console.log("🧹 Clearing Discord Profile...");
            await rpcClient.clearActivity().catch(() => { });
            await new Promise(resolve => setTimeout(resolve, 800));
            await rpcClient.destroy().catch(() => { });
            rpcClient = null;
        }
        return;
    }

    // 2. If ALREADY ON (Update for Injection)
    if (enabled && rpcClient && gameName) {
        console.log(`[DISCORD] Updating Activity: ${gameName}`);
        return rpcClient.setActivity({
            details: `In-Game: ${gameName.toUpperCase()}`,
            state: '⚡ [STATUS_MODULAR_ACTIVE]',
            startTimestamp: new Date(),
            largeImageKey: 'logo',
            instance: false,
        }).catch(() => { });
    }

    // 3. If turning ON (First Connection)
    if (enabled && !rpcClient) {
        rpcClient = new RPC.Client({ transport: 'ipc' });

        rpcClient.on('ready', () => {
            if (!rpcClient) return;
            rpcClient.setActivity({
                details: 'Managing Modules',
                state: 'Status: Undetected',
                startTimestamp: new Date(),
                largeImageKey: 'logo',
                instance: false,
            }).catch(() => { });
        });

        rpcClient.login({ clientId: CLIENT_ID }).catch(() => { rpcClient = null; });
    }
});


// Listener for Machine ID
ipcMain.handle('get-hardware-snapshot', async (event, options = {}) => {
    return getHardwareSnapshot(options);
});

ipcMain.handle('get-machine-id', async (event, options = {}) => {
    const snapshot = await getHardwareSnapshot(options);
    return snapshot.machineId;
});

// Listener for Baseboard Serial
ipcMain.handle('get-baseboard', async () => {
    try {
        // If spoofed 'LastConfig' or similar in Registry, read that here.
        // Otherwise, return a cached spoofed value.
        return spoofer.getBaseboard();
    } catch (e) { return "SERIAL-ERROR"; }
});

// Listener for GPU ID
ipcMain.handle('get-gpuid', async () => {
    return spoofer.getGPUID();
});

ipcMain.handle("getSerial", async (event, options = {}) => {
    const snapshot = await getHardwareSnapshot(options);
    return snapshot.serial;
});

ipcMain.handle("getGPU", async (event, options = {}) => {
    const snapshot = await getHardwareSnapshot(options);
    return snapshot.gpu;
});


// News Terminal
ipcMain.handle('get-news', async () => {
    return [
        "> [v1.1.1] Added CS2 DLL & External support.",
        "> [SECURITY] Spoofer kernel module updated.",
        "> [INFO] New terminal interface integrated."
    ].join('\n');
});

// --- 4. APP LIFECYCLE ---
app.disableHardwareAcceleration();

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.whenReady().then(createWindow);
