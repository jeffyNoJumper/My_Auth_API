const { app, BrowserWindow, ipcMain } = require('electron');

const LOGIN_WINDOW_SIZE = { width: 432, height: 620 };
const PANEL_WINDOW_SIZE = { width: 1100, height: 840 };

let adminWindow = null;

function buildWindow(size) {
    const win = new BrowserWindow({
        width: size.width,
        height: size.height,
        frame: false,
        transparent: true,
        resizable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    win.loadFile('admin.html');
    win.on('closed', () => {
        if (adminWindow === win) {
            adminWindow = null;
        }
    });

    return win;
}

function ensureAdminWindow(size = LOGIN_WINDOW_SIZE, { recreate = false } = {}) {
    if (recreate && adminWindow && !adminWindow.isDestroyed()) {
        adminWindow.destroy();
        adminWindow = null;
    }

    if (!adminWindow || adminWindow.isDestroyed()) {
        adminWindow = buildWindow(size);
    } else {
        adminWindow.setSize(size.width, size.height, true);
        adminWindow.center();
    }

    return adminWindow;
}

function resizeAdminWindow(size) {
    const win = ensureAdminWindow(size);
    win.setSize(size.width, size.height, true);
    win.center();
}

function resetToFreshAuthWindow() {
    const existing = adminWindow;
    adminWindow = buildWindow(LOGIN_WINDOW_SIZE);
    adminWindow.center();

    if (existing && !existing.isDestroyed()) {
        existing.destroy();
    }
}

app.whenReady().then(() => {
    ensureAdminWindow(LOGIN_WINDOW_SIZE, { recreate: true });

    ipcMain.removeAllListeners('admin-close');
    ipcMain.removeAllListeners('admin-min');
    ipcMain.removeAllListeners('admin-expand');
    ipcMain.removeAllListeners('admin-collapse');
    ipcMain.removeAllListeners('admin-fit-auth-card');
    ipcMain.removeAllListeners('admin-reset-auth-shell');

    ipcMain.on('admin-close', () => app.quit());
    ipcMain.on('admin-min', () => {
        if (adminWindow && !adminWindow.isDestroyed()) {
            adminWindow.minimize();
        }
    });
    ipcMain.on('admin-expand', () => resizeAdminWindow(PANEL_WINDOW_SIZE));
    ipcMain.on('admin-collapse', () => resizeAdminWindow(LOGIN_WINDOW_SIZE));
    ipcMain.on('admin-fit-auth-card', () => resizeAdminWindow(LOGIN_WINDOW_SIZE));
    ipcMain.on('admin-reset-auth-shell', () => resetToFreshAuthWindow());
});
