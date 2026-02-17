const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { execSync } = require('child_process');

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

// --- 2. IPC HANDLERS ---

ipcMain.on('window-close', () => {
    app.quit();
});

ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
});

// --- 3. AUTO-UPDATER LOGIC ---

autoUpdater.autoDownload = false;

autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('update-available', {
        version: info.version,
        news: info.releaseNotes
    });
});

ipcMain.handle('start-update-download', () => {
    autoUpdater.downloadUpdate();
});

autoUpdater.on('download-progress', (progressObj) => {
    mainWindow.webContents.send('download-progress', progressObj.percent);
});

autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('update-ready');
    setTimeout(() => {
        autoUpdater.quitAndInstall();
    }, 6000);
});

// Spoofing ----

ipcMain.handle('start-spoof', async (event, options) => { // Accept options from UI
    return new Promise((resolve) => {
        // Pass options as the first argument, and the callback as the second
        spoofer.runSpoofer(options, (err, results) => {
            if (err) {
                console.error("[MAIN] C++ Worker Error:", err);
                resolve({ disk: false, guid: false, Kernel: false, User: false });
            } else {
                // 'results' contains { User, Kernel, disk } from SpoofWorker::OnOK
                resolve(results);
            }
        });
    });
});


ipcMain.handle('launch-game', async (event, gameName, autoClose) => { // Added autoClose arg
    let injectionType = "default";
    let cheatPath = "";

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

        injectionType = response === 0 ? "dll" : "external";

        // Updated filenames to match your project
        const fileName = injectionType === "dll" ? "Ai cheat.dll" : "ZELDAv2.exe";
        cheatPath = path.join(__dirname, 'assets', fileName);
    }

    console.log(`[MAIN] Initializing ${injectionType} from: ${cheatPath}`);

    // Pass arguments to the C++ binding
    const success = spoofer.launchCheat(gameName, injectionType, cheatPath);

    if (success) {
        // Handle the Auto-Close feature from your settings tab
        if (autoClose) {
            console.log("[MAIN] Auto-close enabled. Exiting in 3 seconds...");
            setTimeout(() => {
                app.quit();
            }, 3000);
        }

        return { status: "Success", message: `${gameName} launched successfully!` };
    } else {
        return { status: "Error", message: `Failed to launch ${gameName}.` };
    }
});

ipcMain.on('toggle-stream-proof', (event, enabled) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
        // Native Electron feature to hide window from screen capture
        win.setContentProtection(enabled);
    }
});

// Discord RPC Placeholder
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
        // If you spoofed 'LastConfig' or similar in Registry, read that here.
        // Otherwise, return a cached spoofed value.
        return spoofer.getBaseboard();
    } catch (e) { return "SERIAL-ERROR"; }
});

// Listener for GPU ID
ipcMain.handle('get-gpuid', async () => {
    return spoofer.getGPUID();
});


/* News Terminal */

// Inside main.js
ipcMain.handle('get-news', async () => {
    return [
        "> [v1.0.4] Added CS2 DLL & External support.",
        "> [SECURITY] Spoofer kernel module updated.",
        "> [INFO] New terminal interface integrated."
    ].join('\n'); // Join with a newline
});

// --- 4. APP LIFECYCLE ---

app.disableHardwareAcceleration();

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.whenReady().then(createWindow);
