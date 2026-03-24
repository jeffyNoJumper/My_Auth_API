const { app, BrowserWindow, ipcMain } = require('electron');

const LOGIN_WINDOW_SIZE = { width: 420, height: 520 };
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

    const fitAuthWindow = (bounds = {}) => {
        const width = Math.max(
            LOGIN_WINDOW_SIZE.width,
            Math.min(500, Math.ceil(Number(bounds.width) || 0) + 20)
        );
        const height = Math.max(
            LOGIN_WINDOW_SIZE.height,
            Math.min(660, Math.ceil(Number(bounds.height) || 0) + 24)
        );

        resizeWindow({ width, height });
    };

    ipcMain.on('admin-close', () => app.quit());
    ipcMain.on('admin-min', () => win.minimize());
    ipcMain.on('admin-expand', () => resizeWindow(PANEL_WINDOW_SIZE));
    ipcMain.on('admin-collapse', () => fitAuthWindow());
    ipcMain.on('admin-fit-auth-card', (event, bounds) => fitAuthWindow(bounds));
}

app.whenReady().then(createWindow);
