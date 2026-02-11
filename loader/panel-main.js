const { app, BrowserWindow, ipcMain } = require('electron');

function createWindow() {
    const win = new BrowserWindow({
        width: 450,
        height: 600,
        frame: false,
        transparent: true,
        resizable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    win.loadFile('admin.html');

    // Handle Buttons
    ipcMain.on('admin-close', () => app.quit());
    ipcMain.on('admin-min', () => win.minimize());
}

app.whenReady().then(createWindow);
