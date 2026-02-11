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
        frame: false, // Set to false for that clean custom loader look
        resizable: false,
        backgroundColor: '#050505',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.loadFile('index.html');

    // Check for updates as soon as the window is ready
    mainWindow.once('ready-to-show', () => {
        autoUpdater.checkForUpdatesAndNotify();
    });
}

// --- 2. IPC HANDLERS (Bridge to C++) ---

// Get Real HWID from C++
ipcMain.handle('get-hwid', async () => {
    // This calls your C++ GetMachineID logic
    return spoofer.getMachineID(); 
});

// Run Spoofer
ipcMain.handle('start-spoof', async () => {
    console.log("[MAIN] Triggering C++ Spoofer...");
    return spoofer.runSpoofer();
});

// Launch Games/Cheats
ipcMain.on('launch-game', (event, gameName) => {
    console.log(`[MAIN] Launching logic for: ${gameName}`);
    // You would call your C++ Injector function here
    // Example: spoofer.inject(gameName);
});

// --- 3. AUTO-UPDATER LOGIC ---

autoUpdater.on('update-available', () => {
    mainWindow.webContents.send('update_available');
});

autoUpdater.on('update-downloaded', () => {
    // This forces the app to close, install the update, and relaunch
    autoUpdater.quitAndInstall();
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
