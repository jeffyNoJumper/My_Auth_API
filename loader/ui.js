const API = 'https://sk-auth-api.up.railway.app';

window.onload = async () => {
    await updateHWIDDisplay();

    // 1. Initialize with a slight delay to ensure DOM is ready
    setTimeout(() => {
        particlesJS("particles-js", {
            particles: {
                number: { value: 60 },
                color: { value: "#00ffff" },
                shape: { type: ["circle", "square"] },
                opacity: { value: 0.5 },
                size: { value: 3 },
                move: {
                    enable: true,
                    speed: 1,
                    direction: "none",
                    out_mode: "out"
                }
            },
            interactivity: {
                events: {
                    onhover: { enable: true, mode: "repulse" }
                }
            }
        });
        window.dispatchEvent(new Event('resize'));
        console.log("✨ Particles Initialized & Painted");
    }, 100);

    checkServer();

    const overlay = document.getElementById('update-overlay');

    const currentVersion = localStorage.getItem('installedVersion') || '1.1.1';

    const updateNeeded = await checkForUpdateAndPrompt(currentVersion);

    if (!updateNeeded) {
        if (overlay) {
            overlay.classList.add('hidden');
            overlay.style.display = 'none';
        }
        startBootSequence();
    }
};


const getSetting = (id) => document.getElementById(id).checked;

async function startCS2() {
    // 1. Check if user even has access before trying to launch
    if (!hasAccess('CS2')) return;

    const autoCloseActive = document.getElementById('auto-close-launcher').checked;
    const key = localStorage.getItem('license_key');

    // 2. Pass 'key' as the 3rd argument to match new IPC handler
    const result = await window.electron.invoke('launch-game', 'cs2', autoCloseActive, key);

    if (result && result.status === "Success") {
        if (typeof updateTerminal === 'function') {
            updateTerminal(`> [SUCCESS] ${result.message}`);
        } else {
            addTerminalLine(`> [SUCCESS] ${result.message}`);
        }
    } else if (result && result.status === "Error") {
        // This will now trigger if the C++ side detects a prefix mismatch
        addTerminalLine(`> [ERROR] ${result.message}`);
    }
}

async function launchGame(gameName) {
    if (!hasAccess(gameName)) return;

    const autoCloseActive = document.getElementById('auto-close-launcher').checked;
    const key = localStorage.getItem('license_key');

    const result = await window.electron.invoke('launch-game', gameName, autoCloseActive, key);

    const statusLabel = result.status === "Success" ? "[SUCCESS]" : "[ERROR]";
    addTerminalLine(`> ${statusLabel} ${result.message}`);
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

// Global state
let currentUserPrefix = localStorage.getItem('user_prefix') || "";

// Authentication 
async function handleLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const key = document.getElementById('license-key').value;
    const rememberMe = document.getElementById('remember-me').checked;
    const btn = document.getElementById('login-btn');

    if (!email || !password || !key) {
        return alert("Please fill in all fields (Email, Password, and Key)!");
    }

    btn.innerHTML = `<div class="spinner"></div> VALIDATING...`;
    btn.disabled = true;

    try {
        const realHWID = await window.api.getMachineID();

        // 1. Fetch the data
        const response = await fetch('https://sk-auth-api.up.railway.app/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: email,
                password: password,
                license_key: key,
                hwid: realHWID
            })
        });

        const data = await response.json();

        // 3. Check for Success
        if (data.token === "VALID") {

            if (rememberMe) {
                localStorage.setItem('remembered_email', email);
                localStorage.setItem('remembered_password', password);
                localStorage.setItem('license_key', key);
            } else {
                localStorage.removeItem('remembered_email');
                localStorage.removeItem('remembered_password');
                localStorage.setItem('license_key', key);
            }

            setSessionAccess(key);

            const userPic = document.getElementById('user-pic');
            if (data.profile_pic) {
                localStorage.setItem('saved_profile_pic', data.profile_pic);
                if (userPic) userPic.src = data.profile_pic;
            } else if (userPic) {
                userPic.src = 'imgs/default-profile.png';
            }

            if (data.expiry) {
                const expiryDate = new Date(data.expiry);
                document.getElementById('user-expiry').innerText = "EXP: " + expiryDate.toLocaleDateString();

                updateSubscriptionStatus(data.expiry);
            }

            switchScreen('login-screen', 'main-dashboard');
            updateUIForAccess();

        } else {
            alert("Login Failed: " + (data.error || "Unknown Error"));
            btn.innerHTML = "VALIDATE & LOGIN";
            btn.disabled = false;
        }
    } catch (err) {
        console.error("Login Error:", err);
        alert("API Connection Error. Ensure your Loader is connected to a server & is live.");
        btn.innerHTML = "VALIDATE & LOGIN";
        btn.disabled = false;
    }
}

// Function to handle the visual status dot and expiry colors
function updateSubscriptionStatus(expiryDate) {
    const dot = document.getElementById('status-dot');
    const expiryText = document.getElementById('user-expiry');
    if (!dot || !expiryText) return;

    const now = new Date();
    const expire = new Date(expiryDate);
    const diffMs = expire - now;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    // Reset classes
    dot.classList.remove('dot-online', 'dot-warning', 'dot-offline');

    if (diffMs <= 0) {
        // RED - Expired
        dot.classList.add('dot-offline');
        expiryText.style.color = "#ff4444";
        expiryText.innerText = "EXP: EXPIRED";
        document.querySelectorAll('.launch-btn').forEach(btn => btn.disabled = true);
    }
    else if (diffDays <= 3) {
        // YELLOW - Expiring Soon (3 Days or less)
        dot.classList.add('dot-warning');
        expiryText.style.color = "#ffcc00";
    }
    else {
        // GREEN - Active
        dot.classList.add('dot-online');
        expiryText.style.color = "#00ff88";
    }
}
function updateProfileDisplay(base64Data) {
    const userPic = document.getElementById('user-pic');
    if (!userPic) return;

    if (base64Data && base64Data.startsWith('data:image')) {
        userPic.src = base64Data;
        localStorage.setItem('saved_profile_pic', base64Data);
    } else {
        // 2. Fallback to default if string is broken or empty
        userPic.src = 'imgs/default-profile.png';
    }
}

window.addEventListener('DOMContentLoaded', () => {
    const emailInput = document.getElementById('login-email');
    const passInput = document.getElementById('login-password');
    const keyInput = document.getElementById('license-key');
    const rememberCheckbox = document.getElementById('remember-me');

    const savedEmail = localStorage.getItem('remembered_email');
    const savedPass = localStorage.getItem('remembered_password');
    const savedKey = localStorage.getItem('license_key');

    if (savedEmail && emailInput) emailInput.value = savedEmail;
    if (savedPass && passInput) passInput.value = savedPass;
    if (savedKey && keyInput) keyInput.value = savedKey;

    // If they have saved data, check the box for them
    if (savedEmail && rememberCheckbox) rememberCheckbox.checked = true;
});

function hasAccess(gameName) {
    const accessMap = {
        'CS2': 'CS2X',
        'VALORANT': 'VALX',
        'WARZONE': 'WZX',
        'GTAV': 'GTAX',
        'FORTNITE': 'FRTX'
    };

    if (currentUserPrefix === "ALLX") return true;

    if (currentUserPrefix === accessMap[gameName]) {
        return true;
    }
    alert(`Access Denied! Your key (${currentUserPrefix}) is not valid for ${gameName}.`);
    return false;
}

function setSessionAccess(key) {
    // Splits "CS2X-C567" into "CS2X"
    currentUserPrefix = key.split('-')[0].toUpperCase();
    localStorage.setItem('user_prefix', currentUserPrefix);
}
function updateUIForAccess() {
    const games = ['CS2', 'VALORANT', 'WARZONE', 'GTAV', 'FORTNITE'];
    games.forEach(game => {
        const btn = document.getElementById(`btn-${game.toLowerCase()}`);
        if (btn) {
            const locked = !hasAccessQuietly(game);
            btn.classList.toggle('locked', locked); 
        }
    });
}

document.getElementById('toggle-password').addEventListener('click', function () {
    const passwordInput = document.getElementById('login-password');
    const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';

    passwordInput.setAttribute('type', type);
    this.textContent = type === 'password' ? 'SHOW' : 'HIDE';
});

window.addEventListener('DOMContentLoaded', async () => {

    const emailInput = document.getElementById('login-email');
    const passInput = document.getElementById('login-password');
    const licenseInput = document.getElementById('license-key');
    const userPic = document.getElementById('user-pic');
    const rememberCheckbox = document.getElementById('remember-me');

    // Pull everything from LocalStorage
    const savedEmail = localStorage.getItem('remembered_email');
    const savedPass = localStorage.getItem('remembered_password');
    const savedKey = localStorage.getItem('license_key');
    const savedPic = localStorage.getItem('saved_profile_pic');
    const savedPrefix = localStorage.getItem('user_prefix');

    if (savedEmail && emailInput) emailInput.value = savedEmail;
    if (savedPass && passInput) passInput.value = savedPass;
    if (savedKey && licenseInput) licenseInput.value = savedKey;

    // Check the box if they have saved credentials
    if (savedEmail && rememberCheckbox) rememberCheckbox.checked = true;

    if (savedKey) {
        setSessionAccess(savedKey); // Sets currentUserPrefix in memory
        updateUIForAccess();       // Grays out locked games
    }

    if (userPic) {
        if (savedPic && savedPic !== "null" && savedPic !== "undefined") {
            userPic.src = savedPic;
        } else {
            // Default image if no PFP is found in DB or LocalStorage
            userPic.src = 'imgs/default-profile.png';
        }
    }
    console.log(`[LOADER] Session Restored: ${savedEmail || 'Guest'} | Prefix: ${savedPrefix}`);
});

async function startSpoofing() {

    const statusText = document.getElementById('spoof-main-status');
    const progress = document.getElementById('spoof-progress');
    const btn = document.querySelector('.spoof-btn');
    const subText = document.getElementById('spoof-subtext');

    const options = {
        mode: typeof currentSpoofMode !== 'undefined' ? currentSpoofMode : 'hwid',
        motherboard: document.getElementById('motherboard-select').value,
        biosFlash: document.getElementById('bios-flash').checked,
        cleanReg: document.getElementById('clean-reg').checked,
        cleanDisk: document.getElementById('clean-disk').checked
    };

    btn.disabled = true;
    btn.style.opacity = "0.5";
    progress.classList.remove('hidden'); // SHOW LOADER

    statusText.innerText = "SPOOFING...";
    statusText.className = "processing";
    subText.innerText = "Communicating with kernel driver...";

    try {
        
        const results = await window.api.startSpoof(options);

        if (results && (results.disk || results.guid)) {
            statusText.innerText = "SPOOFED SUCCESSFULLY";
            statusText.className = "active-status";
            subText.innerText = "Hardware identifiers successfully masked.";
        } else {
            statusText.innerText = "FAILED";
            statusText.className = "inactive";
            subText.innerText = "Spoofing failed. Check driver logs.";
        }
    } catch (err) {
        console.error("Bridge Error:", err);
        statusText.innerText = "ERROR";
        statusText.className = "inactive";
        subText.innerText = "Failed to communicate with bridge.";
    } finally {
        
        setTimeout(() => {
            progress.classList.add('hidden'); // HIDE LOADER
            btn.disabled = false;
            btn.style.opacity = "1";
        }, 800);
    }
}


let currentSpoofMode = "hwid";
let spoofState = "inactive"; // inactive | temp | perm

document.addEventListener('DOMContentLoaded', () => {

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

    const savedMode = localStorage.getItem('currentSpoofMode') || 'hwid';
    setSpoofMode(savedMode);
});

// MODE SWITCHING
function setSpoofMode(mode) {
    currentSpoofMode = mode;
    localStorage.setItem('currentSpoofMode', mode);

    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`mode-${mode}`);
    if (activeBtn) activeBtn.classList.add('active');

    updateModeDescription();
}

// Update Text Descriptions
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


// Request HWID Reset Function (UPDATED: FIXED CRASH & API SYNC)
async function requestHWIDReset() {
    const hwidStatus = document.getElementById('hwid-status');
    const spooferStatus = document.getElementById('spoofer-status');
    const hwidText = document.getElementById('hwid-id'); // Get current ID element
    const API_URL = "https://sk-auth-api.up.railway.app";

    if (hwidStatus) {
        hwidStatus.innerText = "BYPASSING BIOS RESTRICTIONS...";
        hwidStatus.className = "processing";
    }

    try {
        // 1. Run local C++ spoofing logic (FIXED: Added {} to prevent TypeError)
        const results = await window.api.startSpoof({});

        if (results) {
            if (hwidStatus) hwidStatus.innerText = "SYNCING WITH DATABASE...";

            const savedKey = localStorage.getItem('license_key');
            const currentHWID = hwidText ? hwidText.innerText : "UNKNOWN";

            // 2. Notify the Admin/API (FIXED: Added /request-hwid-reset path and body)
            const response = await fetch(`${API_URL}/request-hwid-reset`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    hwid: currentHWID,
                    license_key: savedKey,
                    type: "ADMIN-PANEL_RESET"
                })
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || "Server Rejected Sync");
            }

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

            // 3. Refresh IDs in UI
            await updateHWIDDisplay();

            console.log("✅ DB Cleared & Discord Notified. Pending Admin Approval.");
        }
    } catch (err) {
        console.error("❌ Reset Error:", err);
        if (hwidStatus) {
            hwidStatus.innerText = "DB SYNC FAILED";
            hwidStatus.className = "inactive";
        }
    }
}

async function sendAdminRequest() {
    const terminal = document.getElementById('admin-terminal');
    const hwidEl = document.getElementById('hwid-id');
    const hwid = hwidEl ? hwidEl.innerText : "UNKNOWN";
    const savedKey = localStorage.getItem('license_key');

    const addLog = (msg) => {
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        // Sexy color coding
        if (msg.includes("PENDING")) entry.style.color = "var(--gold)";
        if (msg.includes("APPROVED")) entry.style.color = "var(--accent)";
        if (msg.includes("DENIED")) entry.style.color = "var(--red)";

        entry.innerHTML = `<span class="prompt">></span> ${msg}`;
        terminal.appendChild(entry);
        terminal.scrollTop = terminal.scrollHeight;
    };

    if (!savedKey) return addLog("ERROR: DATA NOT FOUND. PLEASE RE-LOGIN.");

    addLog("CONNECTING TO AUTH SERVER...");

    try {
        const response = await fetch(`${API}/request-hwid-reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hwid, license_key: savedKey, type: "ADMIN-PANEL_RESET" })
        });

        const data = await response.json();

        if (data.success) {
            addLog("REQUEST SENT TO ADMIN.");
            addLog("STATUS: PENDING APPROVAL.");

            // --- START LIVE POLLING ---
            const pollInterval = setInterval(async () => {
                try {

                    const statusCheck = await fetch(`${API}/check-reset-status?key=${savedKey}`);
                    const statusData = await statusCheck.json();

                    if (statusData.status === "APPROVED") {
                        addLog("STATUS: APPROVED!");
                        addLog("HWID RESET SUCCESSFUL. RE-LOGGING...");
                        clearInterval(pollInterval);

                        setTimeout(() => { location.reload(); }, 3000);
                    }
                    else if (statusData.status === "DENIED") {
                        addLog("STATUS: DENIED BY ADMIN.");
                        clearInterval(pollInterval);
                    }
                } catch (e) {
                    console.error("Polling error...");
                }
            }, 5000); // Check every 5 seconds

        } else {
            addLog(`FAILED: ${data.error || "REJECTED"}`);
        }
    } catch (err) {
        addLog("CRITICAL: API CONNECTION FAILED.");
    }
}

function setStatus(expiryDate) {
    const status = document.getElementById("user-status");
    const dot = document.getElementById("status-dot");
    if (!status || !dot) return;

    // Calculate time difference
    const now = new Date();
    const expire = new Date(expiryDate);
    const diffMs = expire - now;
    const diffDays = diffMs / (1000 * 60 * 60 * 24); // Convert ms to days

    status.classList.remove("status-active", "status-warning", "status-expired");
    dot.classList.remove("dot-online", "dot-warning", "dot-offline");

    // 3. Determine State based on Time Left
    if (diffMs <= 0) {
        // EXPIRED (RED)
        status.innerText = "SUBSCRIPTION EXPIRED";
        status.classList.add("status-expired");
        dot.classList.add("dot-offline");
        showNotification("Your license has expired. Please renew.", "red");
    }
    else if (diffDays <= 3) {
        // EXPIRING SOON - Less than 3 days (YELLOW)
        status.innerText = "EXPIRING SOON";
        status.classList.add("status-warning");
        dot.classList.add("dot-warning");
        showNotification("Warning: License expires in less than 3 days!", "gold");
    }
    else {
        // ACTIVE (GREEN)
        status.innerText = "SUBSCRIPTION ACTIVE";
        status.classList.add("status-active");
        dot.classList.add("dot-online");
    }
}

// Helper to show a pop-up or overlay if needed
function showNotification(msg, color) {
    const alertBox = document.getElementById("subscription-alert");
    if (alertBox) {
        alertBox.innerText = msg;
        alertBox.style.color = color;
        alertBox.style.display = "block";
    }
}

function setStatus(status) {
    const dot = document.getElementById('status-dot');
    if (!dot) return;

    if (status === "online") {
        dot.classList.remove('dot-offline');
        dot.classList.add('dot-online');
        console.log("System Online");
    } else {
        dot.classList.remove('dot-online');
        dot.classList.add('dot-offline');
        console.log("System Offline");
    }
}

async function checkServer() {
    const API_URL = "https://sk-auth-api.up.railway.app";

    try {
        const res = await fetch(`${API_URL}/health`);

        if (res.ok) {
            setStatus("online");
            console.log("System Sync: OK");
        } else {
            setStatus("offline");
        }
    } catch (err) {
        console.error("Connection Failed:", err);
        setStatus("offline");
    }
}

async function checkForUpdateAndPrompt() {
    const currentVersion = '1.1.1';
    const overlay = document.getElementById('update-overlay');
    const status = document.getElementById('update-status');
    const btn = document.getElementById('update-btn');
    const terminal = document.getElementById('update-terminal');

    // Helper to log specifically to the update terminal
    const logToUpdateTerminal = (msg, isHeader = false) => {
        if (!terminal) return;
        const line = document.createElement('div');
        line.style.marginBottom = '2px';
        line.style.color = isHeader ? 'var(--cyan)' : '#e0e0e0';
        line.innerText = isHeader ? `> ${msg}` : `  ${msg}`;
        terminal.appendChild(line);
        terminal.scrollTop = terminal.scrollHeight;
    };

    let latest;
    try {
        // Clear terminal for a fresh start
        if (terminal) terminal.innerHTML = '<div>> Initializing version check...</div>';
        latest = await window.api.checkVersion(currentVersion);
    } catch (err) {
        if (terminal) terminal.innerHTML = `<div style="color:var(--red)">> ERROR: Connection failed.</div>`;
        if (overlay) {
            overlay.classList.add('hidden');
            overlay.style.display = 'none';
        }
        startBootSequence();
        return false;
    }

    // No update needed → hide overlay and start boot
    if (!latest || latest.version === currentVersion) {
        if (overlay) {
            overlay.classList.add('hidden');
            overlay.style.display = 'none';
        }
        startBootSequence();
        return false;
    }

    // Update available → show overlay
    if (overlay) {
        overlay.classList.remove('hidden');
        overlay.style.display = 'flex';
    }

    // Clear terminal and show update info
    if (terminal) {
        terminal.innerHTML = '';
        logToUpdateTerminal('SYSTEM UPDATE DETECTED', true);
        logToUpdateTerminal(`Update Found: v${latest.version}`, true);
        logToUpdateTerminal(latest.message || 'Standard stability improvements.');
    }

    if (status) status.innerText = 'System update available.';

    if (btn) {
        btn.disabled = false;
        btn.onclick = async () => {
            try {
                btn.disabled = true;
                if (status) status.innerText = 'Downloading update...';

                logToUpdateTerminal('----------------------------');
                logToUpdateTerminal('Initiating secure download...', true);

                const filePath = await window.api.downloadUpdate(latest.url);

                logToUpdateTerminal('SUCCESS: Package downloaded and verified.', true);

                // Save latest version so overlay can be skipped
                localStorage.setItem('installedVersion', latest.version);

                if (status) status.innerText = 'Launching installer...';

                await window.api.runUpdate(filePath);

                // Close old loader window so overlay isn't left hanging
                window.close();

            } catch (err) {
                if (status) status.innerText = `Update Failed`;
                btn.disabled = false;

                logToUpdateTerminal(`CRITICAL ERROR: ${err.message}`, true);

                if (terminal && terminal.lastChild) {
                    terminal.lastChild.style.color = 'var(--red)';
                }
            }
        };
    }

    return true;
}

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
