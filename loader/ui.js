const API = 'https://sk-auth-api.up.railway.app';

// App Entry Point
window.onload = async () => {
    updateHWIDDisplay();

    const updateNeeded = await waitForUpdateCheck();

    if (!updateNeeded) {
        startBootSequence();
    }
};

const getSetting = (id) => document.getElementById(id).checked;

async function startCS2() {
    const autoCloseActive = document.getElementById('auto-close-launcher').checked;

    const result = await window.electron.invoke('launch-game', 'cs2', autoCloseActive);

    if (result && result.status === "Success") {
        if (typeof updateTerminal === 'function') {
            updateTerminal(`> [SUCCESS] ${result.message}`);
        } else {
            addTerminalLine(`> [SUCCESS] ${result.message}`);
        }
    } else if (result && result.status === "Error") {
        addTerminalLine(`> [ERROR] ${result.message}`);
    }
}


function startBootSequence() {
    let progress = 0;
    const bootScreen = document.getElementById('boot-screen');
    const bar = document.getElementById('boot-progress');
    const status = document.getElementById('boot-status');

    if (!bootScreen) {
        switchScreen('boot-screen', 'login-screen');
        return;
    }

    bootScreen.style.display = 'flex';
    bootScreen.style.opacity = '1';
    bootScreen.style.zIndex = '10002';

    const interval = setInterval(() => {
        progress += Math.random() * 12;
        if (progress > 100) progress = 100;

        if (bar) bar.style.width = progress + '%';

        if (status) {
            if (progress <= 20) status.innerText = "Loading secure environment...";
            else if (progress <= 60) status.innerText = "Establishing secure API connection...";
            else if (progress <= 90) status.innerText = "Verifying system integrity...";
            else status.innerText = "Bypassing Anti-Cheat Hooks...";
        }

        if (progress >= 100) {
            clearInterval(interval);

            bootScreen.style.opacity = '0';
            bootScreen.style.pointerEvents = 'none';
            bootScreen.style.transition = 'opacity 0.5s ease, visibility 0.5s';

            setTimeout(() => {
                switchScreen('boot-screen', 'login-screen');

                bootScreen.style.display = 'none';
                bootScreen.style.visibility = 'hidden';
                bootScreen.style.zIndex = '-1';
                bootScreen.innerHTML = '';

                const loginScreen = document.getElementById('login-screen');
                if (loginScreen) {
                    loginScreen.style.zIndex = '2';
                    loginScreen.style.opacity = '1';
                }

                loadNews();
            }, 500);
        }
    }, 600);
}

function waitForUpdateCheck() {
    return new Promise((resolve) => {
        let resolved = false;

        // Listen for updates
        if (window.api.onUpdateAvailable) {
            window.api.onUpdateAvailable((data) => {
                if (resolved) return;
                resolved = true;

                const overlay = document.getElementById('update-overlay');
                if (overlay) overlay.classList.remove('hidden');
                overlay.style.display = 'flex';

                const versionEl = document.getElementById('update-version');
                if (versionEl) versionEl.innerText = `Update Found: v${data.version}`;

                resolve(true);
            });
        }

        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                resolve(false);
            }
        }, 3000);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const settings = [
        'auto-launch',
        'auto-close-launcher',
        'discord-rpc',
        'stream-proof'
    ];

    settings.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;

        const savedState = localStorage.getItem(id);
        if (savedState !== null) {
            el.checked = savedState === 'true';
        }

        el.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            localStorage.setItem(id, isChecked);

            handleSettingChange(id, isChecked);
            addTerminalLine(`> [CONFIG] ${id.replace(/-/g, '_').toUpperCase()} set to ${isChecked}`);
        });
    });
});

function handleSettingChange(id, value) {
    switch (id) {
        case 'auto-launch':
            // window.api.toggleStartup(value); // Requires C++ or Electron login
            break;
        case 'discord-rpc':
            window.api.toggleDiscord(value); // Send to main.js
            break;
        case 'stream-proof':
            // Logic to make your overlay invisible to OBS
            // window.api.setStreamProof(value); 
            break;
    }
}

async function loginUser() {
    const key = document.getElementById('key-input').value;
    const hwid = getHWID();

    if (!key) return alert("Enter your license key!");

    try {
        const res = await fetch('https://sk-auth-api.up.railway.app/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ license_key: key, hwid })
        });
        const data = await res.json();

        if (data.token === "VALID") {

            alert("Login Successful!");
        } else {
            alert("Login Failed: " + data.error);
        }
    } catch (err) {
        console.error(err);
        alert("Connection to server failed!");
    }
}


// Navigation & News Feed Logic
function switchScreen(oldId, newId) {
    document.getElementById(oldId).classList.remove('active');
    document.getElementById(newId).classList.add('active');
}

window.addEventListener('DOMContentLoaded', () => {
    const userPic = document.getElementById('user-pic');
    const profileUpload = document.getElementById('profile-upload');

    const savedPic = localStorage.getItem('saved_profile_pic');
    if (savedPic && userPic) userPic.src = savedPic;

    if (userPic && profileUpload) {
        userPic.addEventListener('click', () => profileUpload.click());

        profileUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (event) => {
                const base64Image = event.target.result;
                
                userPic.src = base64Image;
                localStorage.setItem('saved_profile_pic', base64Image);

                try {
                    const key = localStorage.getItem('license_key');
                    await fetch('https://sk-auth-api.up.railway.app/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ license_key: key, profile_pic: base64Image })
                    });
                } catch (err) {
                    console.error("Failed to sync profile pic to DB");
                }
            };
            reader.readAsDataURL(file);
        });
    }
});

document.getElementById('reset-btn').addEventListener('click', async () => {
    const statusText = document.getElementById('status-text');
    statusText.innerText = "REQUESTING HWID RESET...";

    try {
        const results = await window.api.startSpoof();
        if (results) {
            statusText.innerText = "HWID RESET COMPLETED";
            await updateHWIDDisplay();
        }
    } catch (err) {
        statusText.innerText = "RESET FAILED: CONTACT SUPPORT";
    }
});


// Updated Navigation Logic for 5 Tabs
function showTab(tabName) {

    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
        tab.style.display = 'none';
    });

    const selectedBtn = document.getElementById('btn-' + tabName);
    const selectedTab = document.getElementById(tabName + '-tab');

    if (selectedBtn && selectedTab) {
        selectedBtn.classList.add('active');
        selectedTab.classList.add('active');
        selectedTab.style.display = 'block';
    }

    if (tabName === 'settings') {
        selectedTab.style.display = 'grid';
        loadNews();
    }
    if (tabName === 'hwid') updateHWIDDisplay();
}

async function updateHWIDDisplay() {
    try {
        console.log("Refreshing Hardware Terminal...");

        const hwid = await window.api.getMachineID();
        const serial = await window.api.getBaseboard();
        const gpu = await window.api.getGPUID();

        const hwidElem = document.getElementById('hwid-id');
        const serialElem = document.getElementById('serial-id');
        const gpuElem = document.getElementById('gpu-id');

        if (hwidElem) hwidElem.innerText = hwid || "N/A";
        if (serialElem) serialElem.innerText = serial || "N/A";
        if (gpuElem) gpuElem.innerText = gpu.replace(/&amp;/g, '&');

        console.log("Terminal Refreshed Successfully.");
    } catch (err) {
        console.error("Failed to update terminal:", err);
    }
}




// Authentication
async function handleLogin() {
    const key = document.getElementById('license-key').value;
    const btn = document.getElementById('login-btn');

    if (!key) return alert("Please enter a license key.");

    btn.innerHTML = `<div class="spinner"></div> VALIDATING...`;
    btn.disabled = true;

    try {
        const realHWID = await window.api.getMachineID();
        const response = await fetch('https://sk-auth-api.up.railway.app/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ license_key: key, hwid: realHWID })
        });

        const data = await response.json();

        if (data.token) {
            // Save credentials and profile to LocalStorage
            localStorage.setItem('license_key', key);
            if (data.profile_pic) {
                localStorage.setItem('saved_profile_pic', data.profile_pic);
            }

            // Update UI
            const userPic = document.getElementById('user-pic');
            if (userPic) userPic.src = data.profile_pic || 'imgs/default-profile.png';
            
            document.getElementById('user-expiry').innerText = "EXP: " + new Date(data.expiry).toLocaleDateString();
            
            switchScreen('login-screen', 'main-dashboard');
        } else {
            alert("Login Failed: " + data.error);
            btn.innerHTML = "VALIDATE LICENSE";
            btn.disabled = false;
        }
    } catch (err) {
        alert("API Connection Error. Ensure your Loader is connected to a server & is live.");
        btn.innerHTML = "VALIDATE LICENSE";
        btn.disabled = false;
    }
}

window.addEventListener('DOMContentLoaded', async () => {
    const licenseInput = document.getElementById('license-key');
    const userPic = document.getElementById('user-pic');
    
    // Retrieve saved data
    const savedKey = localStorage.getItem('license_key');
    const savedPic = localStorage.getItem('saved_profile_pic');

    if (savedKey && licenseInput) {
        licenseInput.value = savedKey;
    }

    if (savedPic && userPic) {
        userPic.src = savedPic;
    } else if (userPic) {
        userPic.src = 'imgs/default-profile.png';
    }
});


// Function for the Spoofing Tab
async function startSpoofing() {

    const options = {
        mode: currentSpoofMode,
        motherboard: document.getElementById('motherboard-select').value,
        biosFlash: document.getElementById('bios-flash').checked,
        cleanReg: document.getElementById('clean-reg').checked,
        cleanDisk: document.getElementById('clean-disk').checked
    };

    const statusText = document.getElementById('spoof-main-status');
    const progress = document.getElementById('spoof-progress');
    const btn = document.querySelector('.spoof-btn');

    btn.disabled = true;
    progress.classList.remove('hidden');
    statusText.innerText = "SPOOFING...";
    statusText.className = "processing";

    // Enter Processing State
    mainStatus.innerText = "INITIALIZING...";
    mainStatus.className = "processing";
    loader.classList.remove('hidden');

    try {
        // 2. Call C++ Bridge
        const results = await window.api.startSpoof();

        if (results && (results.disk || results.guid)) {
            mainStatus.innerText = "SPOOFED SUCCESFULLY";
            mainStatus.className = "active-status";

            console.log("Spoofing Active. Identity tab left untouched.");
        } else {
            mainStatus.innerText = "FAILED";
            mainStatus.className = "inactive";
        }
    } catch (err) {
        console.error("Bridge Error:", err);
        mainStatus.innerText = "ERROR";
        mainStatus.className = "inactive";
    } finally {
        setTimeout(() => {
            loader.classList.add('hidden');
        }, 500);
    }
}

let currentSpoofMode = "hwid";
let spoofState = "inactive"; // inactive | temp | perm

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Spoofer Options (Persistence)
    const spooferOptions = ['motherboard-select', 'bios-flash', 'clean-reg', 'clean-disk'];

    spooferOptions.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;

        const saved = localStorage.getItem('spoofer_' + id);
        if (saved !== null) {
            if (el.type === 'checkbox') el.checked = saved === 'true';
            else el.value = saved;
        }

        el.addEventListener('change', () => {
            const val = el.type === 'checkbox' ? el.checked : el.value;
            localStorage.setItem('spoofer_' + id, val);
            console.log(`[SPOOFER] ${id} updated to: ${val}`);
        });
    });

    // 2. Load saved mode preference
    const savedMode = localStorage.getItem('currentSpoofMode') || 'hwid';
    setSpoofMode(savedMode);
});

// MODE SWITCHING
function setSpoofMode(mode) {
    currentSpoofMode = mode;
    localStorage.setItem('currentSpoofMode', mode);

    // Update Button Classes
    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`mode-${mode}`);
    if (activeBtn) activeBtn.classList.add('active');

    updateModeDescription();
}

// Update Text Descriptions based on Mode
function updateModeDescription() {
    const title = document.getElementById('spoof-action-title');
    const desc = document.getElementById('spoof-action-desc');

    if (!title || !desc) return;

    if (currentSpoofMode === 'hwid') {
        title.innerText = "Natural Spoof";
        desc.innerText = "Firmware-level hardware masking for maximum persistence. Recommended for permanent bans.";
    } else {
        title.innerText = "Trace Cleaner";
        desc.innerText = "Temporary session-based cleaning. Use this to clear temporary developer markers.";
    }
}


// UPDATE MODE DESCRIPTION
function updateModeDescription() {

    const title = document.getElementById("spoof-action-title");
    const desc = document.getElementById("spoof-action-desc");
    const warning = document.querySelector(".warning-box");

    if (currentSpoofMode === "hwid") {
        title.textContent = "Natural Spoof (Permanent)";
        desc.textContent = "Reprogram motherboard and hardware serials at firmware level.";
        warning.textContent = "WARNING: Permanent spoof modifies firmware identifiers.";
    }

    if (currentSpoofMode === "traces") {
        title.textContent = "Trace Cleaner (Temporary)";
        desc.textContent = "Removes local tracking artifacts without modifying firmware.";
        warning.textContent = "Temporary spoof resets after reboot.";
    }
}

// STATUS UPDATE
function updateSpoofStatus(state) {

    spoofState = state;

    const status = document.getElementById("spoof-main-status");
    const subtext = document.getElementById("spoof-subtext");

    status.classList.remove("status-inactive", "status-temp", "status-perm");

    if (state === "inactive") {
        status.textContent = "NOT SPOOFED";
        subtext.textContent = "Your hardware identifiers are currently exposed.";
        status.classList.add("status-inactive");
    }

    if (state === "temp") {
        status.textContent = "TEMPORARY SPOOF ACTIVE";
        subtext.textContent = "Session-based masking is enabled.";
        status.classList.add("status-temp");
    }

    if (state === "perm") {
        status.textContent = "PERMANENT SPOOF ACTIVE";
        subtext.textContent = "Firmware-level spoof successfully applied.";
        status.classList.add("status-perm");
    }
}

// SPOOF EXECUTION
function startSpoofing() {

    const loader = document.getElementById("spoof-progress");

    loader.classList.remove("hidden");

    setTimeout(() => {

        loader.classList.add("hidden");

        if (currentSpoofMode === "hwid") {
            updateSpoofStatus("perm");
        } else {
            updateSpoofStatus("temp");
        }

    }, 2500);
}

// INITIALIZE ON TAB LOAD
document.addEventListener("DOMContentLoaded", function () {
    updateModeDescription();
    updateSpoofStatus("inactive");
});


// Request HWID Reset Function
async function requestHWIDReset() {
    const hwidStatus = document.getElementById('hwid-status');
    const spooferStatus = document.getElementById('spoofer-status');
    const API_URL = "https://sk-auth-api.up.railway.app";

    if (hwidStatus) {
        hwidStatus.innerText = "BYPASSING BIOS RESTRICTIONS...";
        hwidStatus.className = "processing";
    }

    try {
        // Run local C++ spoofing logic
        const results = await window.api.startSpoof();
        if (results) {

            if (hwidStatus) hwidStatus.innerText = "SYNCING WITH DATABASE...";

            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                }
            });

            // Give OS time to flush ID's
            await new Promise(resolve => setTimeout(resolve, 2000));

            if (hwidStatus) {
                hwidStatus.innerText = "HWID RESET COMPLETED";
                hwidStatus.className = "active-status";
            }

            if (spooferStatus) {
                spooferStatus.innerText = "ACTIVE";
                spooferStatus.className = "active-status";
            }

            // Refresh IDs in UI
            await updateHWIDDisplay();

            console.log("DB Cleared. New HWID will be captured on next login.");
        }
    } catch (err) {
        console.error("API Error:", err);
        if (hwidStatus) {
            hwidStatus.innerText = "DB SYNC FAILED";
            hwidStatus.className = "inactive";
        }
    }
}

async function sendAdminRequest() {
    const terminal = document.getElementById('admin-terminal');
    const hwid = document.getElementById('hwid-id').innerText;
    const savedKey = localStorage.getItem('license_key'); 

    const addLog = (msg) => {
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        if (msg.includes("PENDING")) entry.style.color = "var(--gold)";
        entry.innerHTML = `<span class="prompt">></span> ${msg}`;
        terminal.appendChild(entry);
        terminal.scrollTop = terminal.scrollHeight;
    };


    if (!savedKey) {
        return addLog("ERROR: DATA NOT FOUND. PLEASE RE-LOGIN.");
    }

    addLog("CONNECTING TO AUTH SERVER...");

    try {
        const response = await fetch(`${API}/request-hwid-reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                hwid: hwid,
                license_key: savedKey,
                type: "MANUAL_RESET"
            })
        });

        if (!response.ok) throw new Error("Server Error");

        const data = await response.json();

        if (data.success) {
            addLog("REQUEST SENT TO ADMIN.");
            addLog("STATUS: PENDING APPROVAL.");
        } else {
            addLog(`FAILED: ${data.error || "REJECTED"}`);
        }
    } catch (err) {
        addLog("CRITICAL: API CONNECTION FAILED.");
    }
}


// AUTO-UPDATER UI LOGIC
window.api.onUpdateAvailable((data) => {
    document.getElementById('update-overlay').classList.remove('hidden');
    document.getElementById('update-version').innerText = `Update Found: v${data.version}`;

    if (data.news) {
        document.getElementById('update-status').innerText = data.news;
    }
});

function setStatus(state) {
    const status = document.getElementById("user-status");
    if (!status) return;

    status.classList.remove(
        "status-online",
        "status-offline",
        "status-expired"
    );
    status.classList.add(`status-${state}`);
}

async function checkServer() {
    try {
        const res = await fetch("/api/health");
        if (res.ok) {
            setStatus("online");
        } else {
            setStatus("offline");
        }
    } catch {
        setStatus("offline");
    }
}

checkServer();



async function startUpdateDownload() {
    document.getElementById('update-btn').disabled = true;
    document.getElementById('update-status').innerText = "Starting download...";
    await window.api.startUpdateDownload();
}

window.api.onDownloadProgress((percent) => {
    const bar = document.getElementById('update-progress');
    bar.style.width = percent + '%';
    document.getElementById('update-status').innerText = `Downloading: ${Math.round(percent)}%`;
});

window.api.onUpdateReady(() => {
    document.getElementById('update-status').innerText = "Success! Relaunching in 3 seconds...";
    document.getElementById('update-status').style.color = "#00ff88";
});

document.addEventListener("DOMContentLoaded", () => {
    const cards = document.querySelectorAll(".game-card");

    cards.forEach(card => {
        const imgElement = card.querySelector(".card-img");
        const images = card.dataset.images.split(",");
        let index = 0;

        // Set initial image
        imgElement.src = images[index];

        // Rotate every 3 seconds
        setInterval(() => {
            index = (index + 1) % images.length;

            imgElement.style.opacity = 0;

            setTimeout(() => {
                imgElement.src = images[index];
                imgElement.style.opacity = 1;
            }, 200);

        }, 3000);
    });
});

function typeNews(text) {
    const newsContainer = document.getElementById('news-feed-text');
    if (!newsContainer) {
        console.error("Critical: 'news-feed-text' element not found in HTML.");
        return;
    }

    newsContainer.innerHTML = "";
    let i = 0;
    const speed = 30;

    function type() {
        if (i < text.length) {
            newsContainer.innerHTML += text.charAt(i);
            i++;
            setTimeout(type, speed);
        }
    }
    type();
}

// Updated News Loader
let newsLoaded = false;

async function loadNews() {

    if (newsLoaded) return;

    try {
        const news = await window.api.getNews();
        const terminal = document.getElementById('main-terminal');

        if (news) {
            const lines = news.split('\n');

            const feedContainer = document.getElementById('news-feed-text');
            if (feedContainer) feedContainer.innerHTML = "";

            lines.forEach((line, index) => {
                setTimeout(() => {
                    addTerminalLine(line);
                }, index * 150);
            });
            newsLoaded = true;
        } else {
            addTerminalLine("> [SYSTEM] Online: No new announcements.");
        }
    } catch (err) {
        console.error("News Load Error:", err);
        addTerminalLine("> [ERROR] Failed to synchronize news feed.");
    }
}

// Terminal Input Handler
const terminalInput = document.getElementById('terminal-cmd');
if (terminalInput) {
    terminalInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            const cmd = e.target.value.trim().toLowerCase();
            if (cmd !== "") {
                addTerminalLine(`SK-USER:~$ ${cmd}`);

                if (cmd === 'clear') {
                    document.getElementById('main-terminal').innerHTML = '<div id="news-feed-text" class="typewriter"></div>';
                } else if (cmd === 'help') {
                    addTerminalLine("> Available: status, inject, version, clear");
                } else if (cmd === 'status') {
                    addTerminalLine("> [SYSTEM] Security: Secure | Modules: Loaded");
                } else {
                    addTerminalLine(`> Unknown command: ${cmd}`);
                }

                e.target.value = "";
                const box = document.getElementById('main-terminal');
                box.scrollTop = box.scrollHeight;
            }
        }
    });
}

function addTerminalLine(text) {
    const box = document.getElementById('main-terminal');
    if (!box) return;
    const line = document.createElement('div');
    line.className = 'terminal-line';
    line.innerText = text;
    box.appendChild(line);
}

document.getElementById('stream-proof').addEventListener('change', (e) => {
    window.api.toggleStreamProof(e.target.checked);
    addTerminalLine(`> [SYSTEM] Stream Proof: ${e.target.checked ? 'ENABLED' : 'DISABLED'}`);
});

document.getElementById('discord-rpc').addEventListener('change', (e) => {
    window.api.toggleDiscord(e.target.checked);
});

// --- SETTINGS ACTIONS ---

// Function to wipe the terminal UI
function clearLogs() {
    const terminal = document.getElementById('main-terminal');
    if (terminal) {
        terminal.innerHTML = '<div id="news-feed-text" class="typewriter">> [SYSTEM] Logs cleared. Buffer reset.</div>';
        newsLoaded = false;
        console.log("[UI] Terminal logs cleared by user.");
    }
}

// Function to reset all saved toggles and localStorage
function resetConfig() {
    const confirmed = confirm("WARNING: This will reset all saved settings and preferences. Continue?");

    if (confirmed) {
        // 1. Clear the local storage
        localStorage.clear();

        const checkboxes = document.querySelectorAll('.switch-container input[type="checkbox"]');
        checkboxes.forEach(cb => {
            if (cb.id === 'auto-close-launcher') {
                cb.checked = true;
            } else {
                cb.checked = false;
            }
        });

        addTerminalLine("> [SYSTEM] Configuration reset. Reloading UI...");
        setTimeout(() => {
            window.location.reload();
        }, 1500);
    }
}


// Injection
async function launchGame(gameName) {
    const res = await window.api.launchCheat(gameName);
    alert(res.message);
}
