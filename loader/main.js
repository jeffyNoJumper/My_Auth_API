const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const crypto = require('crypto');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');


let mainWindow
let spoofer
const RPC = require('discord-rpc');
const CLIENT_ID = '1476724607485743277';
let rpcClient = null;

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

function quickAdd(days) {
    console.log(`[DEBUG] Quick Add Triggered: +${days}D`);
    modifyKey('add-time', days);
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
        width: 820,
        height: 720,
        frame: false,
        resizable: false,
        icon: path.join(__dirname, 'imgs/SK_App_Icon.ico'),
        backgroundColor: '#050505',
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
        autoUpdater.checkForUpdatesAndNotify();
    });
}

// --- IPC HANDLERS ---
ipcMain.on('window-close', () => {
    app.quit();
});

ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
});

// --- 3. AUTO-UPDATER LOGIC ---
autoUpdater.autoDownload = false;

ipcMain.on('check-for-updates', () => {
    autoUpdater.checkForUpdates();
});

autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('update-available', {
        version: info.version,
        news: typeof info.releaseNotes === 'string' ? info.releaseNotes : "Stability and performance improvements."
    });
});

ipcMain.on('start-update-download', () => {
    autoUpdater.downloadUpdate();
});

autoUpdater.on('download-progress', (progressObj) => {
    mainWindow.webContents.send('download-progress', progressObj.percent);
});

// Download finished: Notify user & prepare for installation
autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('update-ready');
    setTimeout(() => {
        autoUpdater.quitAndInstall();
    }, 6000);
});

autoUpdater.on('update-not-available', () => {
    mainWindow.webContents.send('update-not-available');
});

autoUpdater.on('error', (err) => {
    mainWindow.webContents.send('update-error', err.message || 'Check connection.');
});

ipcMain.on('log-to-terminal', (event, message) => {
    console.log('[UPDATE LOG]', message);
});

ipcMain.handle('start-spoof', async (event, options) => {

    const crypto = require('crypto');
    const brandNewGUID = crypto.randomUUID();

    // COMPLETE OPTION MAP
    const safeOptions = {

        motherboard: options?.motherboard || "Other",

        // ---- BOOLEAN FLAGS (C++ EXPECTS THESE) ----
        disk: Boolean(options?.disk ?? true),
        guid: Boolean(options?.guid ?? true),
        kernel: Boolean(options?.kernel ?? true),
        user: Boolean(options?.user ?? true),

        cleanReg: Boolean(options?.cleanReg ?? true),
        cleanDisk: Boolean(options?.cleanDisk ?? true),
        biosFlash: Boolean(options?.biosFlash ?? false),

        // ---- GENERATED HWID ----
        newMachineGuid: String(brandNewGUID)
    };

    console.log("[MAIN] Spoof Config:", safeOptions);

    return new Promise((resolve) => {
        try {

            console.log(
                `[MAIN] Writing Registry ID: ${safeOptions.newMachineGuid}`
            );

            spoofer.runSpoofer(safeOptions, (err, results) => {

                if (err) {
                    console.error("[MAIN] C++ Error:", err);
                    resolve({ success: false });
                    return;
                }

                resolve({
                    success: true,
                    newHwid: brandNewGUID,
                    motherboard: safeOptions.motherboard,
                    ...results
                });
            });

        } catch (crash) {

            console.error("[MAIN] Fatal Crash:", crash);

            resolve({
                success: false,
                error: "MAIN_CRASH"
            });
        }
    });
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

ipcMain.handle('launch-game', async (event, gameName, autoClose, licenseKey, injectionType) => {
    const finalType = injectionType || "external";
    const gameUpper = gameName.toUpperCase();

    // 1. Determine the correct filename
    let fileName = (gameUpper === 'CS2' && finalType === "dll") ? "Ai cheat.dll" : (gameUpper === 'CS2' ? "Noxen.exe" : `${gameUpper}.exe`);

    // 2. THE PATH FIX: Step UP from 'loader' to the root 'assets' folder
    // __dirname is .../loader/, so '..' takes us to the project root
    const injectorPath = path.join(__dirname, '..', 'assets', 'Extreme Injector v3.exe');
    const cheatPath = path.join(__dirname, '..', 'assets', fileName);

    console.log(`[MAIN] Initializing ${finalType} for ${gameUpper}`);

    try {
        // --- DLL INJECTOR LOGIC ---
        if (gameUpper === 'CS2' && finalType === "dll") {

            const cmd = `powershell -Command "Start-Process '${injectorPath}' -WindowStyle Hidden"`;

            if (!fs.existsSync(injectorPath)) {
                console.error(`❌ INJECTOR NOT FOUND AT: ${injectorPath}`);
                return { status: "Error", message: "Injector file missing!" };
            }

            const quotedInjector = `"${injectorPath}"`;
            const quotedCheat = `"${cheatPath}"`;

            const { exec } = require('child_process');
            const assetsPath = path.join(__dirname, '..', 'assets');


            console.log(`[DEBUG] Executing Command: ${cmd}`);

            exec(cmd, { shell: true }, (err) => {
                if (err) {
                    console.error("[LAUNCH ERROR] Failed to start injector:", err.message);
                }
            });

            return { status: "Success", message: "DLL Injector Dispatched." };
        }

        // --- EXTERNAL LOGIC (C++) ---
        const success = spoofer.launchCheat(
            String(gameUpper),
            String(finalType),
            String(cheatPath),
            String(licenseKey)
        );

        if (success) {
            if (autoClose) {
                console.log("[MAIN] Auto-close active. Exiting in 3s...");
                setTimeout(() => { app.quit(); }, 3000);
            }
            return { status: "Success", message: `${gameName} launched successfully!` };
        } else {
            return { status: "Error", message: `Access Denied: Invalid Key for ${gameName}` };
        }
    } catch (err) {
        console.error("[C++ CRASH]", err);
        return { status: "Error", message: "Kernel communication failed." };
    }
});



ipcMain.on('toggle-stream-proof', (event, enabled) => {
    // This makes the window black for OBS and Discord screenshare
    if (mainWindow) {
        mainWindow.setExclusionFromCapture(enabled);
        console.log(`[MAIN] Stream Proof: ${enabled ? 'ENABLED' : 'DISABLED'}`);
    }
});

ipcMain.on('toggle-discord', async (event, enabled) => {
    // 1. If turning OFF
    if (!enabled) {
        if (rpcClient) {
            console.log("🧹 Sending Clear Signal...");
            // Force the profile to go blank first
            await rpcClient.clearActivity().catch(() => { });
            // WAIT - Discord needs a moment to update your profile
            await new Promise(resolve => setTimeout(resolve, 1000));

            await rpcClient.destroy().catch(() => { });
            rpcClient = null;
            console.log("🛑 RPC Connection Severed.");
        }
        return;
    }

    // 2. If turning ON
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

        rpcClient.login({ clientId: CLIENT_ID }).catch(() => {
            rpcClient = null;
        });
    }
});


// Listener for Machine ID
ipcMain.handle('get-machine-id', async () => {
    try {

        await new Promise(r => setTimeout(r, 1500));

        const output = execSync(
            'reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
            { encoding: "utf8" }
        );

        const lines = output.split('\n');

        for (const line of lines) {
            if (line.includes("MachineGuid")) {
                const parts = line.trim().split(/\s+/);
                return parts[parts.length - 1];
            }
        }

        return "GUID_NOT_FOUND";

    } catch (err) {
        console.error("[HWID READ ERROR]", err);
        return "REG_ACCESS_FAILED";
    }
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
