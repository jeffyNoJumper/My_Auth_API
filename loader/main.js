const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const spoofer = require('./build/Release/spoofer.node');

let mainWindow;
let latestNews = null;
let isAuthorized = false;

app.setAppUserModelId("com.sk.allinone");

// --- 1. WINDOW SETUP ---
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 820,
        height: 700,
        frame: false,
        resizable: false,
        backgroundColor: '#050505',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            backgroundThrottling: true,
            offscreen: false,
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

// --- 2. IPC HANDLERS ---
ipcMain.on('window-close', () => {
    app.quit();
});

ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
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
    return spoofer.runSpoofer();
});

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


// --- 3. AUTO-UPDATER & NEWS LOGIC ---

autoUpdater.autoDownload = false; // We want to show a "Update Available" message first

autoUpdater.on('update-available', (info) => {
    latestNews = info.releaseNotes;

    mainWindow.webContents.send('update-available', {
        version: info.version,
        news: info.releaseNotes
    });
});

ipcMain.handle('get-news', async () => {
    try {
        return await autoUpdater.getCachedUpdateInfo();
    } catch (err) {
        console.error("Failed to get news:", err);
        return { news: "No updates available" };
    }
});


// 3b. Trigger Download (When user clicks 'Update' in UI)
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
    }, 6000);
});

async function checkLogin(key) {
    const hwid = await window.api.getMachineIdentifier();
    const res = await window.api.login(key, hwid);
    if (res.token === "VALID") isAuthorized = true;
    return res;
}

function launchGame(name) {
    if (!isAuthorized) return alert("Invalid key! Login first.");
    window.api.launchCheat(name);
}





app.disableHardwareAcceleration();

app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
