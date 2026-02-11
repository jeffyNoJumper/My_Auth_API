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

ipcMain.on('window-close', () => {
    app.quit();
});

ipcMain.on('window-minimize', () => {
    if (BrowserWindow) BrowserWindow.minimize();
});

// Get HWID from C++ Bridge
ipcMain.handle('get-hwid', async () => {
    try {
        return spoofer.getMachineID();
    } catch (err) {
        console.error("C++ HWID Error:", err);
        return "UNKNOWN_ID";
    }
});

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

const { autoUpdater } = require('electron-updater');

// --- 3. AUTO-UPDATER & NEWS LOGIC ---

// 3a. Checking for Updates
autoUpdater.autoDownload = false; // We want to show a "Update Available" message first

autoUpdater.on('update-available', (info) => {
    // This sends the version AND the Release Notes (News) to your UI
    mainWindow.webContents.send('update-available', {
        version: info.version,
        news: info.releaseNotes // This pulls the text you type on GitHub!
    });
});

// 3b. Trigger Download (When user clicks 'Update' in your UI)
ipcMain.handle('start-update-download', () => {
    autoUpdater.downloadUpdate();
});

// 3c. Track Progress
autoUpdater.on('download-progress', (progressObj) => {
    mainWindow.webContents.send('download-progress', progressObj.percent);
});

// 3d. Finalize & Relaunch
autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('update-ready');
    // Give the user 3 seconds to see the "Success" message before restart
    setTimeout(() => {
        autoUpdater.quitAndInstall();
    }, 3000);
});

// 3e. Fetch General News (Optional: Fetch even if no update)
ipcMain.handle('get-news', async () => {
    // This allows your UI to pull the latest GitHub Release description as a 'News Feed'
    return await autoUpdater.getCachedUpdateInfo();
});


app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
