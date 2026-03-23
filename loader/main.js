const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const crypto = require('crypto');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { execFile, exec, spawn } = require('child_process');
const fs = require('fs');
const axios = require('axios');
const { promisify } = require('util');

const exePath = path.join(__dirname, 'bin', 'Volumeid64.exe');

const newID = "12AB-34CD";

let mainWindow
let spoofer
const RPC = require('discord-rpc');
const CLIENT_ID = '1476724607485743277';
let rpcClient = null;
const execFileAsync = promisify(execFile);
let hardwareSnapshotCache = null;
let hardwareSnapshotPromise = null;

app.on('will-quit', async () => {
    if (rpcClient) {
        try {
            // THE FINAL WIPE
            await rpcClient.clearActivity().catch(() => { });
            await rpcClient.destroy().catch(() => { });
            console.log("💀 Ghost Status Purged on Exit");
        } catch (e) { }
    }
});

async function changeVolumeID() {

    const hwid = await spoofer.getMachineID(); // or window.api.getMachineID()

    // remove dashes and uppercase
    const clean = hwid.replace(/-/g, "").toUpperCase();

    // take first 8 hex chars
    const volumeID = clean.slice(0, 4) + "-" + clean.slice(4, 8);

    const exePath = path.join(__dirname, 'bin', 'Volumeid64.exe');

    execFile(exePath, ["C:", volumeID], { windowsHide: true }, (err, stdout, stderr) => {

        if (err) {
            console.error("VolumeID Failed:", err);
            return;
        }

        console.log("VolumeID Changed To:", volumeID);
    });
}

function hwidToVolumeID(hwid) {

    const hash = crypto.createHash("md5")
        .update(hwid)
        .digest("hex")
        .toUpperCase();

    return hash.slice(0, 4) + "-" + hash.slice(4, 8);
}

function quickAdd(days) {
    console.log(`[DEBUG] Quick Add Triggered: +${days}D`);
    modifyKey('add-time', days);
}

function resetHardwareSnapshot() {
    hardwareSnapshotCache = null;
    hardwareSnapshotPromise = null;
}

function parseCommandValue(output, headerName) {
    const lines = output
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

    if (!lines.length) {
        return "UNKNOWN";
    }

    if (!headerName) {
        return lines[1] || lines[0] || "UNKNOWN";
    }

    const match = lines.find(line => line.includes(headerName));
    if (!match) {
        return "UNKNOWN";
    }

    const parts = match.split(/\s+/);
    return parts[parts.length - 1] || "UNKNOWN";
}

async function readMachineGuid() {
    try {
        const { stdout } = await execFileAsync(
            'reg',
            ['query', 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
            { encoding: 'utf8', windowsHide: true }
        );

        return parseCommandValue(stdout, 'MachineGuid') || "GUID_NOT_FOUND";
    } catch (err) {
        console.error("[HWID READ ERROR]", err);
        return "REG_ACCESS_FAILED";
    }
}

async function readDiskSerial() {
    try {
        const { stdout } = await execFileAsync(
            'wmic',
            ['diskdrive', 'get', 'serialnumber'],
            { encoding: 'utf8', windowsHide: true }
        );

        return parseCommandValue(stdout);
    } catch (err) {
        console.error("[SERIAL READ ERROR]", err);
        return "UNKNOWN";
    }
}

async function readGpuId() {
    try {
        const { stdout } = await execFileAsync(
            'wmic',
            ['path', 'win32_VideoController', 'get', 'PNPDeviceID'],
            { encoding: 'utf8', windowsHide: true }
        );

        return parseCommandValue(stdout);
    } catch (err) {
        console.error("[GPU READ ERROR]", err);
        return "UNKNOWN";
    }
}

async function getHardwareSnapshot(options = {}) {
    const { forceRefresh = false } = options;

    if (forceRefresh) {
        resetHardwareSnapshot();
    }

    if (hardwareSnapshotCache) {
        return hardwareSnapshotCache;
    }

    if (!hardwareSnapshotPromise) {
        hardwareSnapshotPromise = Promise.all([
            readMachineGuid(),
            readDiskSerial(),
            readGpuId()
        ])
            .then(([machineId, serial, gpu]) => {
                hardwareSnapshotCache = { machineId, serial, gpu };
                return hardwareSnapshotCache;
            })
            .finally(() => {
                hardwareSnapshotPromise = null;
            });
    }

    return hardwareSnapshotPromise;
}

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
        width: 980,
        height: 780,
        frame: false,
        resizable: false,
        transparent: true,
        center: true,
        icon: path.join(__dirname, 'imgs/VEXION.ico'),
        // backgroundColor: '#050505', 
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            partition: 'persist:sk_loader',
            backgroundThrottling: true,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    mainWindow.loadFile('index.html');

    mainWindow.once('ready-to-show', () => {
        autoUpdater.checkForUpdatesAndNotify();
        mainWindow.center(); 
        mainWindow.show();
    });
}

// --- IPC HANDLERS ---
ipcMain.on('window-close', () => {
    app.quit();
});

ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('start-spoof', async (event, options) => {

    const crypto = require('crypto');
    const brandNewGUID = crypto.randomUUID();

    const safeOptions = {

        motherboard: options?.motherboard || "Other",

        disk: Boolean(options?.disk ?? true),
        guid: Boolean(options?.guid ?? true),
        kernel: Boolean(options?.kernel ?? true),
        user: Boolean(options?.user ?? true),

        cleanReg: Boolean(options?.cleanReg ?? true),
        cleanDisk: Boolean(options?.cleanDisk ?? true),
        biosFlash: Boolean(options?.biosFlash ?? false),

        deepClean: Boolean(options?.deepClean ?? false),

        newMachineGuid: String(brandNewGUID)
    };

    console.log("[MAIN] Spoof Config (Deep Clean: " + safeOptions.deepClean + "):", safeOptions);

    try {

        // ---------------- LOAD KERNEL DRIVER ----------------

        if (safeOptions.kernel) {

            const basePath = app.isPackaged
                ? process.resourcesPath
                : __dirname;

            const kdmapperPath = path.join(basePath, "assets", "kdmapper_Release.exe");
            const driverPath = path.join(basePath, "assets", "km.sys");

            console.log("[MAIN] Launching kdmapper...");

            await runKDMapper(kdmapperPath, driverPath);

            console.log("[MAIN] Kernel driver mapped successfully");

        }

        // ---------------- RUN SPOOFER ----------------

        return await new Promise((resolve) => {

            console.log(`[MAIN] Writing Registry ID: ${safeOptions.newMachineGuid}`);

            spoofer.runSpoofer(safeOptions, async (err, results) => {

                if (err) {

                    console.error("[MAIN] C++ Error:", err);

                    resolve({ success: false });

                    return;

                }

                try {

                    if (safeOptions.deepClean) {

                        console.log("[MAIN] Deep Clean Enabled → Running VolumeID Mutation");

                        await changeVolumeID();

                    }

                } catch (volumeError) {

                    console.error("[MAIN] VolumeID Error:", volumeError);

                }

                resetHardwareSnapshot();

                resolve({
                    success: true,
                    newHwid: brandNewGUID,
                    motherboard: safeOptions.motherboard,
                    ...results
                });

            });

        });

    } catch (crash) {

        console.error("[MAIN] Fatal Crash:", crash);

        return {
            success: false,
            error: "MAIN_CRASH"
        };

    }
    function runKDMapper(mapperPath, driverPath) {

        return new Promise((resolve, reject) => {

            const proc = spawn(mapperPath, [driverPath], {
                windowsHide: true
            });

            proc.stdout.on("data", data => {
                console.log("[KDMAPPER]", data.toString());
            });

            proc.stderr.on("data", data => {
                console.error("[KDMAPPER ERROR]", data.toString());
            });

            proc.on("error", err => {
                console.error("[KDMAPPER SPAWN ERROR]", err);
                reject(err);
            });

            proc.on("close", code => {

                console.log("[KDMAPPER] Exit Code:", code);

                if (code === 0)
                    resolve();
                else
                    reject(new Error("kdmapper failed"));

            });

        });

    }
});

ipcMain.handle('check-version', async () => {
    return {
        version: '1.1.3',
        url: 'https://raw.githubusercontent.com/jeffyNoJumper/My_Auth_API/refs/heads/main/version.txt'
    };
});

ipcMain.handle('get-latest-release', async () => {
    const res = await axios.get("https://github.com/jeffyNoJumper/My_Auth_API/releases/download/v1.1.2/VEXION.ALL-IN-ONE.Setup.1.1.2.exe");
    const exe = res.data.assets.find(a => a.name.endsWith(".exe"));
    return {
        version: res.data.tag_name,
        url: exe ? exe.browser_download_url : null,
        name: exe ? exe.name : null
    };
});

ipcMain.handle('download-update', async (event, url, fileName) => {
    const response = await axios({ url, method: 'GET', responseType: 'arraybuffer' });
    const downloads = path.join(os.homedir(), "Downloads");
    const savePath = path.join(downloads, fileName);

    fs.writeFileSync(savePath, Buffer.from(response.data));
    return savePath; // Returns the string path to ui.js
});

ipcMain.handle('run-update', async (event, filePath) => {
    shell.openPath(filePath);
    app.quit();
});

function updateRPCStatus(gameName) {
    if (rpcClient && rpcClient.transport.socket) {
        rpcClient.setActivity({
            details: `Gaming: ${gameName}`,
            state: 'Status: Undetected',
            startTimestamp: new Date(),
            largeImageKey: 'logo',
            instance: false,
        }).catch(() => console.log("⚠️ RPC Update Failed"));
        console.log(`[RPC] Status updated to: ${gameName}`);
    }
}

function isCS2Running() {
    return new Promise((resolve) => {
        exec('tasklist /FI "IMAGENAME eq cs2.exe"', (err, stdout) => {
            if (err) return resolve(false);
            resolve(stdout.toLowerCase().includes("cs2.exe"));
        });
    });
}

function waitForCS2() {
    return new Promise((resolve) => {

        const interval = setInterval(() => {

            exec('tasklist /FI "IMAGENAME eq cs2.exe"', (err, stdout) => {

                if (stdout.toLowerCase().includes("cs2.exe")) {
                    clearInterval(interval);
                    resolve(true);
                }

            });

        }, 300); // check every 3 seconds
    });
}

ipcMain.handle('launch-game', async (event, gameName, autoClose, licenseKey, injectionType, userData) => {

    console.log("[LAUNCH] Received userData:", userData);

    const finalType = injectionType || "external";
    const gameUpper = gameName.toUpperCase();
    const assetsPath = path.join(__dirname, '..', 'assets');

    function getDaysRemaining(expiry) {
        if (!expiry) return "Unknown";

        const now = new Date();
        const exp = new Date(expiry);
        const diff = exp - now;

        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

        if (days <= 0) return "Expired";
        if (days > 3650) return "Lifetime";

        return `${days} days`;
    }

    try {
        if (!fs.existsSync(assetsPath)) {
            return { status: "Error", message: "Assets folder missing!" };
        }

        const files = fs.readdirSync(assetsPath);
        const targetExt = (gameUpper === 'CS2' && finalType === "dll") ? ".dll" : ".exe";

        const fileName = files.find(file => {
            const name = file.toLowerCase();
            const ext = path.extname(name);
            return ext === targetExt && !name.includes('extreme injector') && !name.includes('.sys');
        });

        if (!fileName) {
            return { status: "Error", message: `No valid ${targetExt} found in assets!` };
        }

        const injectorPath = path.join(assetsPath, 'Extreme Injector v3.exe');
        const cheatPath = path.join(assetsPath, fileName);

        // ===== DLL INJECTION =====
        const { spawn, exec } = require("child_process");

        if (gameUpper === "CS2" && finalType === "dll") {

            const running = await isCS2Running();

            if (!running) {

                exec('start "" "steam://rungameid/730"');

                await waitForCS2();
            }

            spawn(injectorPath, [], {
                cwd: assetsPath,
                detached: true,
                stdio: "ignore",
                windowsHide: true
            }).unref();

            return {
                status: "Success",
                message: "DLL injected successfully."
            };
        }

        // ===== EXE LAUNCH =====
        if (finalType === "external") {

            const uName = userData?.username ?? "Unknown";
            const uSub = userData?.subscription ?? "Unknown";
            const uExp = getDaysRemaining(userData?.expiry);

            const launchData = `${uName}|${uSub}|${uExp}`;

            const externalCmd = `powershell -Command "& '${cheatPath}' '${launchData}'"`;

            require('child_process').exec(externalCmd, { shell: true }, (err) => {
                if (err) console.error("[EXTERNAL ERROR]", err.message);
            });

            if (rpcClient) {
                rpcClient.setActivity({
                    details: `Playing ${gameUpper}`,
                    state: '🛡️ [STATUS_UNDETECTED]',
                    startTimestamp: new Date(),
                    largeImageKey: 'logo',
                }).catch(() => { });
            }

            if (autoClose) {
                setTimeout(() => { app.quit(); }, 3000);
            }

            return { status: "Success", message: `${fileName} launched successfully!` };
        }

    } catch (err) {
        console.error("[LAUNCH CRASH]", err);
        return { status: "Error", message: "Failed to communicate with loader assets." };
    }
});




ipcMain.on('toggle-stream-proof', (event, enabled) => {
    if (mainWindow) {
        // Just send a message back to the UI to hide specific elements
        mainWindow.webContents.send('apply-stream-proof', enabled);
        console.log(`[MAIN] UI Stream Proof Mode: ${enabled ? 'ON' : 'OFF'}`);
    }
});



// Add 'gameName' as a second parameter (it will be null when toggling from settings)
ipcMain.on('toggle-discord', async (event, enabled, gameName = null) => {

    // 1. If turning OFF (Standard Toggle)
    if (!enabled) {
        if (rpcClient) {
            console.log("🧹 Clearing Discord Profile...");
            await rpcClient.clearActivity().catch(() => { });
            await new Promise(resolve => setTimeout(resolve, 800));
            await rpcClient.destroy().catch(() => { });
            rpcClient = null;
        }
        return;
    }

    // 2. If ALREADY ON (Update for Injection)
    if (enabled && rpcClient && gameName) {
        console.log(`[DISCORD] Updating Activity: ${gameName}`);
        return rpcClient.setActivity({
            details: `In-Game: ${gameName.toUpperCase()}`,
            state: '⚡ [STATUS_MODULAR_ACTIVE]',
            startTimestamp: new Date(),
            largeImageKey: 'logo',
            instance: false,
        }).catch(() => { });
    }

    // 3. If turning ON (First Connection)
    if (enabled && !rpcClient) {
        rpcClient = new RPC.Client({ transport: 'ipc' });

        rpcClient.on('ready', () => {
            if (!rpcClient) return;
            rpcClient.setActivity({
                details: 'Managing Modules',
                state: 'Status: Undetected',
                startTimestamp: new Date(),
                largeImageKey: 'logo',
                instance: false,
            }).catch(() => { });
        });

        rpcClient.login({ clientId: CLIENT_ID }).catch(() => { rpcClient = null; });
    }
});


// Listener for Machine ID
ipcMain.handle('get-hardware-snapshot', async (event, options = {}) => {
    return getHardwareSnapshot(options);
});

ipcMain.handle('get-machine-id', async (event, options = {}) => {
    const snapshot = await getHardwareSnapshot(options);
    return snapshot.machineId;
});

// Listener for Baseboard Serial
ipcMain.handle('get-baseboard', async () => {
    try {
        // If spoofed 'LastConfig' or similar in Registry, read that here.
        // Otherwise, return a cached spoofed value.
        return spoofer.getBaseboard();
    } catch (e) { return "SERIAL-ERROR"; }
});

// Listener for GPU ID
ipcMain.handle('get-gpuid', async () => {
    return spoofer.getGPUID();
});

ipcMain.handle("getSerial", async (event, options = {}) => {
    const snapshot = await getHardwareSnapshot(options);
    return snapshot.serial;
});

ipcMain.handle("getGPU", async (event, options = {}) => {
    const snapshot = await getHardwareSnapshot(options);
    return snapshot.gpu;
});


// News Terminal
ipcMain.handle('get-news', async () => {
    return [
        "> [v1.1.1] Added CS2 DLL & External support.",
        "> [SECURITY] Spoofer kernel module updated.",
        "> [INFO] New terminal interface integrated."
    ].join('\n');
});

// --- 4. APP LIFECYCLE ---
app.disableHardwareAcceleration();

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.whenReady().then(createWindow);
