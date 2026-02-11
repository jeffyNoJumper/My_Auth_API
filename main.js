const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const spoofer = require('./build/Release/spoofer.node');

let mainWindow;

// --- 1. WINDOW SETUP ---
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        frame: false,
        resizable: false,
        backgroundColor: '#050505',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.loadFile('index.html');

    // Check for updates as soon as the app starts
    mainWindow.once('ready-to-show', () => {
        autoUpdater.checkForUpdatesAndNotify();
    });
}

// --- 2. IPC HANDLERS (Real C++ Logic) ---

// Get HWID from C++ Bridge
ipcMain.handle('get-hwid', async () => {
    try {
        return spoofer.getMachineID();
    } catch (err) {
        console.error("C++ HWID Error:", err);
        return "UNKNOWN_ID";
    }
});

// Run Spoofer logic
ipcMain.handle('start-spoof', async () => {
    console.log("[MAIN] Calling C++ Spoofer...");
    return spoofer.runSpoofer(); // Returns {disk: true, guid: true, mac: true}
});

// Launch/Injection Logic
ipcMain.handle('launch-game', async (event, gameName) => {
    console.log(`[MAIN] Initializing Injection for: ${gameName}`);

    // Call the C++ LaunchCheat function from binding.cpp
    const success = spoofer.launchCheat(gameName);

    if (success) {
        return { status: "Success", message: `${gameName} injected successfully!` };
    } else {
        return { status: "Error", message: `Failed to inject ${gameName}.` };
    }
});

// --- 3. AUTO-UPDATER LOGIC ---

// When a new version is found on GitHub
autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('update-available', info.version);
});

// Track download progress to show on your HTML UI
autoUpdater.on('download-progress', (progressObj) => {
    mainWindow.webContents.send('download-progress', progressObj.percent);
});

// When update is ready, it swaps the old EXE for the new one
autoUpdater.on('update-downloaded', () => {
    // Optional: Send one last message to UI
    mainWindow.webContents.send('update-ready');
    // Quits app and runs the new installer automatically
    setTimeout(() => {
        autoUpdater.quitAndInstall();
    }, 2000);
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
