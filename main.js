const { app, BrowserWindow, ipcMain } = require('electron');
const spoofer = require('./build/Release/spoofer.node');

ipcMain.handle('start-spoof', async () => {
    // This calls the C++ code
    const results = spoofer.runSpoofer();
    return results;
});
