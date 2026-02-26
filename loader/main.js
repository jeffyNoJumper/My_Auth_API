const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');

let mainWindow
let spoofer
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
        icon: path.join(__dirname, 'imgs/SK.ico'),
        backgroundColor: '#050505',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
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

    const safeOptions = options || {};

    return new Promise((resolve) => {
        try {
            // Call the C++ addon with the SAFE options object
            spoofer.runSpoofer(safeOptions, (err, results) => {
                if (err) {
                    console.error("[MAIN] C++ Worker Error:", err);
                    // Return null or failure so UI knows it failed
                    resolve(null);
                } else {
                    // 'results' contains { User, Kernel, disk } from your C++ OnOK
                    console.log("[MAIN] Spoof Success:", results);

                    // Return a clean object with a success flag
                    resolve({
                        success: true,
                        ...results
                    });
                }
            });
        } catch (crash) {
            console.error("[MAIN] Spoofer Crash:", crash);
            resolve(null);
        }
    });
});S

ipcMain.handle('launch-game', async (event, gameName, autoClose, licenseKey) => {
    let injectionType = "default";
    let cheatPath = "";

    // Logic for CS2 (DLL vs External)
    if (gameName.toLowerCase() === 'cs2') {
        const { response } = await dialog.showMessageBox({
            type: 'question',
            buttons: ['Inject DLL', 'External', 'Cancel'],
            defaultId: 0,
            cancelId: 2,
            title: 'Injection Method',
            message: 'How would you like to launch the CS2 cheat?',
            detail: 'DLL injection is internal, External runs as a separate process.'
        });

        if (response === 2) return { status: "Cancelled", message: "Injection aborted." };

        injectionType = (response === 0) ? "dll" : "external";

        // Logic for filenames
        const fileName = (injectionType === "dll") ? "Ai cheat.dll" : "Noxen.exe";
        cheatPath = path.join(__dirname, 'assets', fileName);
    }
    else {

        const fileName = `${gameName.toLowerCase()}.exe`;
        cheatPath = path.join(__dirname, 'assets', fileName);
        injectionType = "external";
    }

    console.log(`[MAIN] Initializing ${injectionType} for ${gameName} using key prefix...`);

    try {
        const success = spoofer.launchCheat(gameName.toUpperCase(), injectionType, cheatPath, licenseKey);

        if (success) {
            if (autoClose) {
                console.log("[MAIN] Auto-close enabled. Exiting in 3 seconds...");
                setTimeout(() => { app.quit(); }, 3000);
            }
            return { status: "Success", message: `${gameName} launched successfully!` };
        } else {
            return { status: "Error", message: `Access Denied Key is NOT VALID for ${gameName}.` };
        }
    } catch (err) {
        console.error("[C++ Error]", err);
        return { status: "Error", message: "You Dont Have Access To This Game." };
    }
});



ipcMain.on('toggle-stream-proof', (event, enabled) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {

        win.setContentProtection(enabled);
    }
});

ipcMain.on('toggle-discord', (event, enabled) => {
    if (enabled) {
        console.log("[MAIN] Discord RPC Enabled");
        // Initialize your discord-rpc library here
    } else {
        console.log("[MAIN] Discord RPC Disabled");
        // Destroy discord-rpc client here
    }
});


// Listener for Machine ID
ipcMain.handle('get-machine-id', async () => {
    try {
        return execSync('reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography" /v "MachineGuid"').toString().split('REG_SZ')[1].trim();
    } catch (e) { return "ERROR_READING_REG"; }
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
