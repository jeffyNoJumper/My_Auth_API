const { app, BrowserWindow, ipcMain } = require('electron');

const LOGIN_WINDOW_SIZE = { width: 470, height: 650 };
const PANEL_WINDOW_SIZE = { width: 1100, height: 840 };

function createWindow() {
    const win = new BrowserWindow({
        width: LOGIN_WINDOW_SIZE.width,
        height: LOGIN_WINDOW_SIZE.height,
        frame: false,
        transparent: true,
        resizable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    win.loadFile('admin.html');

    const resizeWindow = (size) => {
        if (!win || win.isDestroyed()) {
            return;
        }

        win.setSize(size.width, size.height, true);
        win.center();
    };

    ipcMain.on('admin-close', () => app.quit());
    ipcMain.on('admin-min', () => win.minimize());
    ipcMain.on('admin-expand', () => resizeWindow(PANEL_WINDOW_SIZE));
    ipcMain.on('admin-collapse', () => resizeWindow(LOGIN_WINDOW_SIZE));
}

app.whenReady().then(createWindow);
