
const API = 'https://my-auth-api-1ykc.onrender.com';

let countdownInterval;
let progress = 0;
let newsLoaded = false;
let expiryCheckInterval = null;

const shell = window.api.shell;

let currentUserPrefix = localStorage.getItem('user_prefix') || "";

window.onload = async () => {
    // 1. IMMEDIATE PFP CHECK
    const savedPfp = localStorage.getItem('saved_profile_pic');
    const syncProfileUI = () => {
        if (savedPfp) {
            const navPfp = document.getElementById('user-pic');
            const modalPfp = document.getElementById('modal-pfp');
            if (navPfp) navPfp.src = savedPfp;
            if (modalPfp) modalPfp.src = savedPfp;
            console.log("✨ Persistent Profile Image Synchronized");
        }
    };

    syncProfileUI();

    await updateHWIDDisplay();
    await checkServer();

    const overlay = document.getElementById('update-overlay');
    const currentVersion = localStorage.getItem('installedVersion') || '1.1.1';
    const updateNeeded = await checkForUpdateAndPrompt(currentVersion);

    if (!updateNeeded) {
        if (overlay) {
            overlay.classList.add('hidden');
            overlay.style.display = 'none';
        }

        // --- SESSION & EXPIRY GUARD ---
        const savedExpiry = localStorage.getItem('expiry_date');
        const savedEmail = localStorage.getItem('user_email');
        const savedKey = localStorage.getItem('license_key');

        if (savedExpiry && savedEmail && savedKey) {
            const now = new Date().getTime();
            const expTime = new Date(savedExpiry).getTime();

            // Check if user expired while app was closed
            if (now >= expTime) {
                console.warn("[SECURITY] Session expired. Wiping local data.");
                localStorage.removeItem('user_email');
                localStorage.removeItem('license_key');
                localStorage.removeItem('expiry_date');
                // Stay on login screen
                startBootSequence();
            } else {
                console.log("[SECURITY] Session Valid. Initializing Heartbeat.");

                startExpiryHeartbeat(savedExpiry);

                startBootSequence();
                setTimeout(() => {
                    switchScreen('login-screen', 'main-dashboard');
                    syncProfileUI();
                    updateUIForAccess();
                }, 500);
            }
        } else {
            // No saved session, just show login
            startBootSequence();
        }
    }
};
function toggleDropdown() {
    document.getElementById('user-dropdown').classList.toggle('hidden');
}

function openShop() {

    shell.openExternal("https://discord.com/channels/1244947057320661043/1373758276960911380");
}

function openSocial(platform) {
    if (platform === 'discord') shell.openExternal("https://discord.com/channels/1244947057320661043/1373757489241395292");
}


const getSetting = (id) => document.getElementById(id).checked;

async function startCS2() {

    if (!hasAccess('CS2')) return;

    const autoCloseActive = document.getElementById('auto-close-launcher').checked;
    const key = localStorage.getItem('license_key');

    const result = await window.electron.invoke('launch-game', 'cs2', autoCloseActive, key);

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

async function launchGame(gameName) {
    if (!hasAccess(gameName)) return;

    const key = localStorage.getItem('license_key');
    const autoCloseActive = document.getElementById('auto-close-launcher').checked;

    // --- THE ID FIX: Target 'main-progress-bar' ---
    const statusDiv = document.getElementById('injection-status');
    const bar = document.getElementById('main-progress-bar');
    const text = document.getElementById('status-text');
    const percentText = document.getElementById('status-percent');

    let injectionType = "external";

    if (gameName.toLowerCase() === 'cs2') {
        openModal('cs2-modal');
        injectionType = await new Promise((resolve) => {
            window.submitCS2Choice = (choice) => { resolve(choice); };
        });
        closeModal('cs2-modal');
        if (injectionType === 'cancel') {
            addTerminalLine("> [SYSTEM] CS2 Injection cancelled.");
            return;
        }
    }

    // 1. Switch to Home Tab
    showTab('home');

    // 2. TRIGGER ANIMATION (With a tiny delay to ensure tab is visible)
    if (statusDiv && bar) {
        statusDiv.classList.remove('hidden');
        statusDiv.style.display = 'block'; // Force display

        setTimeout(() => {
            bar.style.width = "45%";
            if (percentText) percentText.innerText = "45%";
            if (text) {
                text.innerText = `COMMUNICATING WITH ${gameName.toUpperCase()}...`;
                text.style.color = "var(--accent)";
            }
        }, 50); // 50ms delay gives the UI time to "breathe"
    }

    addTerminalLine(`> [SYSTEM] Initializing ${gameName.toUpperCase()}...`);

    const result = await window.api.launchCheat(
        gameName,
        autoCloseActive,
        key,
        injectionType
    );

    // 3. FINALIZE ANIMATION
    if (result.status === "Success") {
        if (bar) bar.style.width = "100%";
        if (percentText) percentText.innerText = "100%";
        if (text) {
            text.innerText = "INJECTION SUCCESSFUL!";
            text.style.color = "#00ff88";
        }

        setTimeout(() => {
            if (statusDiv) statusDiv.classList.add('hidden');
            if (bar) bar.style.width = "0%";
            if (percentText) percentText.innerText = "0%";
        }, 3000);
    } else {
        if (bar) bar.style.width = "0%";
        if (percentText) percentText.innerText = "0%";
        if (text) {
            text.innerText = "ACCESS DENIED / ERROR";
            text.style.color = "#ff4444";
        }
    }

    const statusLabel = result.status === "Success" ? "[SUCCESS]" : "[ERROR]";
    addTerminalLine(`> ${statusLabel} ${result.message}`);
}


let resolveCS2;
function submitCS2Choice(choice) {
    if (resolveCS2) {
        resolveCS2(choice);
    }
}

function startBootSequence() {
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
    addTerminalLine(`> [CONFIG] Executing ${id.toUpperCase()}...`);

    switch (id) {

        case 'discord-rpc':
            const rpcCheckbox = document.getElementById('discord-rpc');
            rpcCheckbox.disabled = true;

            window.api.toggleDiscord(value);
            addTerminalLine(`> [SYSTEM] Synchronizing Discord RPC...`);

            setTimeout(() => { rpcCheckbox.disabled = false; }, 2000);
            break;

        case 'stream-proof':
            window.api.toggleStreamProof(value);
            break;

        case 'auto-launch':
            if (window.api.toggleAutoLaunch) window.api.toggleAutoLaunch(value);
            break;

        case 'auto-close-launcher':
            addTerminalLine(`> [SYSTEM] Preference saved: ${value ? 'EXIT_ON_INJECT' : 'STAY_OPEN'}`);
            break;
    }
}

async function loginUser() {
    const key = document.getElementById('key-input').value;
    const hwid = getHWID();

    if (!key) return alert("Enter your license key!");

    try {
        const res = await fetch('https://my-auth-api-1ykc.onrender.com/login', {
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

// Function to force-apply the PFP to all relevant elements
function syncProfileImage() {
    const savedPic = localStorage.getItem('saved_profile_pic');
    if (!savedPic) return;

    // Target both the top-nav pic and the settings modal pic
    const targets = ['user-pic', 'modal-pfp'];
    targets.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.src = savedPic;
            console.log(`[PFP] Synced: ${id}`);
        }
    });
}

// 1. Initial Load when App Opens
window.addEventListener('DOMContentLoaded', () => {
    syncProfileImage();

    const userPic = document.getElementById('user-pic');
    const profileUpload = document.getElementById('profile-upload');

    if (userPic && profileUpload) {
        // Trigger file input when clicking PFP
        userPic.addEventListener('click', () => profileUpload.click());

        profileUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (event) => {
                const base64Image = event.target.result;

                // Save locally first for instant feedback
                localStorage.setItem('saved_profile_pic', base64Image);
                syncProfileImage();

                try {
                    const key = localStorage.getItem('license_key');
                    // FIX: Pointing to the correct /update-profile route
                    const res = await fetch('https://my-auth-api-1ykc.onrender.com', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            license_key: key,
                            profile_pic: base64Image
                        })
                    });
                    const data = await res.json();
                    if (data.success) console.log("✅ Profile pic synced to Render DB");
                } catch (err) {
                    console.error("❌ Failed to sync profile pic to DB", err);
                }
            };
            reader.readAsDataURL(file);
        });
    }
});

// 2. Updated switchScreen to prevent resets during tab changes
function switchScreen(oldId, newId) {
    const oldScreen = document.getElementById(oldId);
    const newScreen = document.getElementById(newId);

    if (oldScreen) {
        oldScreen.classList.remove('active');
        oldScreen.style.display = 'none'; // Force it to vanish
        oldScreen.style.zIndex = '-1';    // Push it to the back
    }

    if (newScreen) {
        newScreen.classList.add('active');
        newScreen.style.display = 'flex'; // Matches your .screen flex layout
        newScreen.style.zIndex = '10';    // Bring it to the front
    }

    if (newId === 'main-dashboard') {
        syncProfileUI(); // Fixed function name to match your window.onload
    }
}


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

        if (tabName === 'settings') {
            selectedTab.style.display = 'grid';
            loadNews();
        } else {
            selectedTab.style.display = 'block';
        }
    }

    if (tabName === 'home') {
        const rpcEnabled = localStorage.getItem('discord-rpc') === 'true';
        if (rpcEnabled) {

            window.api.toggleDiscord(true);
        }
    }

    if (tabName === 'hwid') updateHWIDDisplay();

    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) dropdown.classList.add('hidden');

    console.log(`[UI] Switched to ${tabName.toUpperCase()} module.`);
}

async function updateHWIDDisplay() {
    try {
        console.log("Refreshing Hardware Terminal...");

        const hwidElem = document.getElementById('hwid-id');
        const serialElem = document.getElementById('serial-id');
        const gpuElem = document.getElementById('gpu-id');

        if (hwidElem) hwidElem.innerText = "FETCHING...";

        await new Promise(r => setTimeout(r, 1000));

        const hwid = await window.api.getMachineID();
        const serial = await window.api.getBaseboard();
        const gpu = await window.api.getGPUID();

        if (hwidElem) hwidElem.innerText = hwid || "N/A";
        if (serialElem) serialElem.innerText = serial || "N/A";
        if (gpuElem) gpuElem.innerText = gpu ? gpu.replace(/&amp;/g, '&') : "N/A";

        console.log("Terminal Refreshed. New HWID Captured:", hwid);
    } catch (err) {
        console.error("Failed to update terminal:", err);
    }
}

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

        const response = await fetch('https://my-auth-api-1ykc.onrender.com/login', {
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

        if (data.token === "VALID") {

            localStorage.setItem('user_email', email);
            localStorage.setItem('expiry_date', data.expiry);
            localStorage.setItem('license_key', key);

            startExpiryHeartbeat(data.expiry);

            setSessionAccess(key);

            if (rememberMe) {
                localStorage.setItem('remembered_email', email);
                localStorage.setItem('remembered_password', password);
            } else {
                localStorage.removeItem('remembered_email');
                localStorage.removeItem('remembered_password');
            }

            const userPic = document.getElementById('user-pic');
            const modalPfp = document.getElementById('modal-pfp');

            if (data.profile_pic && data.profile_pic !== "") {
                localStorage.setItem('saved_profile_pic', data.profile_pic);
                if (userPic) userPic.src = data.profile_pic;
                if (modalPfp) modalPfp.src = data.profile_pic;
            } else {

                const defaultImg = 'imgs/default-profile.png';
                if (userPic) userPic.src = defaultImg;
                if (modalPfp) modalPfp.src = defaultImg;
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
        alert("API Connection Error. Ensure your Render server is live.");
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
        // Fallback to default if string is broken or empty
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
    if (!key || !key.includes('-')) {
        console.error("[AUTH] Invalid key format for prefix extraction.");
        return;
    }

    // Splits "CS2X-C567" into "CS2X"
    currentUserPrefix = key.split('-')[0].toUpperCase();
    localStorage.setItem('user_prefix', currentUserPrefix);

    console.log(`[AUTH] Session Prefix set to: ${currentUserPrefix}`);
}

function hasAccessQuietly(gameName) {
    const prefix = currentUserPrefix || localStorage.getItem('user_prefix');
    if (prefix === "ALLX") return true;

    const map = {
        'CS2': 'CS2X',
        'VALORANT': 'VALX',
        'WARZONE': 'WZX',
        'GTAV': 'GTAX',
        'FORTNITE': 'FRTX'
    };

    return map[gameName] === prefix;
}

function updateUIForAccess() {

    const savedKey = localStorage.getItem('license_key') || "";
    const currentPrefix = currentUserPrefix || (savedKey.includes('-') ? savedKey.split('-')[0].toUpperCase() : "NONE");
    const expiry = localStorage.getItem('expiry_date');
    const email = localStorage.getItem('user_email') || "User";

    const navExp = document.getElementById('user-expiry');
    const homeUsername = document.getElementById('home-username');

    if (homeUsername) {
        const cleanName = email.includes('@') ? email.split('@')[0].toUpperCase() : email.toUpperCase();
        homeUsername.innerHTML = `<span style="color:#00ff88;">ACTIVE</span> (${cleanName})`;
    }

    if (navExp) {
        if (currentPrefix === "ALLX" || currentPrefix === "LIFE") {
            navExp.innerText = "EXP: LIFETIME";
        } else if (expiry && expiry !== "null") {
            const d = new Date(expiry);
            navExp.innerText = "EXP: " + d.toLocaleDateString();
        } else {
            navExp.innerText = "EXP: PENDING";
        }
    }

    function refreshHomeTile() {
        const homeExp = document.getElementById('home-exp');
        if (!homeExp) return;

        if (currentPrefix === "ALLX" || currentPrefix === "LIFE") {
            homeExp.innerText = "LIFETIME";
            return;
        }

        if (!expiry || expiry === "null") {
            homeExp.innerText = "PENDING";
            return;
        }

        const expDate = new Date(expiry).getTime();
        const now = new Date().getTime();
        const diff = expDate - now;

        if (diff <= 0) {
            homeExp.innerText = "EXPIRED";
            homeExp.style.color = "var(--red)";
            return;
        }

        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);

        if (d >= 1) {

            homeExp.innerText = `${d} Days`;
        } else {

            homeExp.innerText = `${h}h ${m}m ${s}s`;
            homeExp.style.color = "var(--accent)";
        }
    }

    refreshHomeTile();
    if (window.homeTileInterval) clearInterval(window.homeTileInterval);
    window.homeTileInterval = setInterval(refreshHomeTile, 1000);

    const games = ['CS2', 'VALORANT', 'WARZONE', 'GTAV', 'FORTNITE'];
    games.forEach(game => {
        const btn = document.getElementById(`btn-${game.toLowerCase()}`);
        if (btn) {
            const hasAccess = (currentPrefix === "ALLX") || hasAccessQuietly(game);
            btn.classList.toggle('locked', !hasAccess);

            if (currentPrefix === "ALLX") {
                btn.style.boxShadow = "0 0 10px rgba(255, 215, 0, 0.2)";
                btn.style.borderColor = "var(--gold)";
            } else {
                btn.style.boxShadow = "none";
                btn.style.borderColor = "";
            }
        }
    });

    console.log(`[UI] Sync Complete for: ${email}`);
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

// --- MODAL CONTROLS ---
// Open the Modal
function openModal(id) {
    const modal = document.getElementById(id);
    const dropdown = document.getElementById('user-dropdown');

    if (modal) {

        modal.classList.remove('hidden');
        hideUserDropdown();

        if (dropdown) dropdown.classList.add('hidden');

        console.log("✅ Modal Opened:", id);
    } else {
        console.error("❌ Modal ID not found:", id);
    }
}

// Close the Modal
function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add('hidden');
    }
}

// --- IMAGE PREVIEW ---
function previewImage(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('modal-pfp').src = e.target.result;
            // Temporarily store the base64 string
            window.tempPfp = e.target.result;
        };
        reader.readAsDataURL(input.files[0]);
    }
}

// --- SAVE TO RENDER & LOCAL ---
async function saveProfileChanges() {
    const email = document.getElementById('edit-email').value;
    const password = document.getElementById('edit-password').value;
    const key = localStorage.getItem('license_key');
    const btn = document.getElementById('save-profile-btn');

    btn.innerText = "SAVING...";

    try {
        const response = await fetch(`${API}/update-profile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                license_key: key,
                email: email || null,
                password: password || null,
                profile_pic: window.tempPfp || null
            })
        });

        const data = await response.json();
        if (data.success) {
            // Update Local Storage so it persists on restart
            if (email) localStorage.setItem('user_email', email);
            if (window.tempPfp) {
                localStorage.setItem('saved_profile_pic', window.tempPfp);
                document.getElementById('user-pic').src = window.tempPfp;
            }

            alert("Success! Profile updated.");
            closeModal('settings-modal');
            updateUIForAccess(); // Refresh the home tab name
        }
    } catch (e) { alert("Failed to connect to server."); }
    btn.innerText = "SAVE CHANGES";
}

// --- LOAD SAVED PFP ON STARTUP ---
function loadSavedPfp() {
    const saved = localStorage.getItem('saved_profile_pic');
    if (saved) {
        document.getElementById('user-pic').src = saved;
        if (document.getElementById('modal-pfp')) document.getElementById('modal-pfp').src = saved;
    }
}

async function startSpoofing() {

    const loader = document.getElementById("spoof-progress");

    if (spoofState === "running") return;

    spoofState = "running";
    loader.classList.remove("hidden");

    try {

        const options = {
            motherboard: document.getElementById("motherboard-select").value,
            biosFlash: document.getElementById("bios-flash").checked,
            cleanReg: document.getElementById("clean-reg").checked,
            cleanDisk: document.getElementById("clean-disk").checked,

            // mode mapping
            user: currentSpoofMode === "hwid",
            disk: currentSpoofMode === "traces"
        };

        console.log("[UI] Sending spoof request:", options);

        const result =
            await window.api.startSpoof(options);

        loader.classList.add("hidden");

        if (result && result.success) {

            updateSpoofStatus(
                currentSpoofMode === "hwid"
                    ? "perm"
                    : "temp"
            );

            localStorage.setItem(
                "spoofState",
                currentSpoofMode === "hwid"
                    ? "perm"
                    : "temp"
            );

        } else {
            updateSpoofStatus("inactive");
        }

    } catch (err) {

        console.error("[UI SPOOF ERROR]", err);
        loader.classList.add("hidden");
        updateSpoofStatus("inactive");
    }

    spoofState = "idle";
}


// INITIALIZE ON TAB LOAD
document.addEventListener("DOMContentLoaded", function () {
    updateModeDescription();
    updateSpoofStatus("inactive");
});

let currentSpoofMode = "hwid";

function setSpoofMode(mode) {
    currentSpoofMode = mode;
    localStorage.setItem('currentSpoofMode', mode);

    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`mode-${mode}`);
    if (activeBtn) activeBtn.classList.add('active');

    updateModeDescription();
}

document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        setSpoofMode(btn.dataset.mode);
    });
});

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

// Request HWID Reset Function (UPDATED: CAPTURES NEW HWID FOR DB)
async function requestHWIDReset() {
    const hwidStatus = document.getElementById('hwid-main-status');
    const API_URL = "https://my-auth-api-1ykc.onrender.com";
    const btn = document.getElementById('reset-btn');

    if (hwidStatus) {
        hwidStatus.innerText = "BYPASSING BIOS RESTRICTIONS...";
        hwidStatus.className = "processing";
    }

    if (btn) btn.disabled = true;

    try {
        // 1. RUN THE DRIVER (This changes the local HWID)
        const results = await window.api.startSpoof({
            disk: true,
            guid: true,
            kernel: true,
            user: true,
            cleanReg: true,
            cleanDisk: true
        });

        if (results) {

            if (hwidStatus) hwidStatus.innerText = "CAPTURING NEW IDENTITY...";

            // Give the Windows kernel 3 seconds to chnage registry/disk changes
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Re-read system IDs so the screen shows the NEW one
            await updateHWIDDisplay();

            // Grab the UPDATED ID from the UI to send to the server
            const newHWID = document.getElementById('hwid-id').innerText;
            const savedKey = localStorage.getItem('license_key');

            if (hwidStatus) hwidStatus.innerText = "SYNCING WITH DATABASE...";

            const response = await fetch(`${API_URL}/request-hwid-reset`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    hwid: newHWID, // Send the spoofed ID, not the old one
                    license_key: savedKey,
                    type: "ADMIN-PANEL_RESET"
                })
            });

            const data = await response.json();
            if (!data.success) throw new Error(data.error || "Server Rejected Sync");

            if (hwidStatus) {
                hwidStatus.innerText = "HWID RESET COMPLETED";
                hwidStatus.className = "active-status";
            }

            console.log("✅ DB Cleared & Discord Notified with New HWID:", newHWID);
        }
    } catch (err) {
        console.error("❌ Reset Error:", err);
        if (hwidStatus) {
            hwidStatus.innerText = "DB SYNC FAILED";
            hwidStatus.className = "inactive";
        }
    } finally {
        if (btn) btn.disabled = false;
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
    const statusDot = document.getElementById('status-dot');
    const API = "https://my-auth-api-1ykc.onrender.com"; // Your Render URL

    try {
        const response = await fetch(`${API}/health`);
        if (response.ok) {
            if (statusDot) {
                statusDot.className = "status-dot dot-online";
                console.log("✅ Render API: Online");
            }
        } else {
            throw new Error();
        }
    } catch (err) {
        if (statusDot) {
            statusDot.className = "status-dot dot-offline";
            console.log("❌ Render API: Offline");
        }
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

// --- SETTINGS ACTIONS ---
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

// --- UI CONTROLS ---
function toggleUserDropdown() {
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) dropdown.classList.toggle('hidden');
}

function openShop() {

    window.api.openExternal("https://discord.gg/RG7bEgrHF9");
    hideUserDropdown();
}

function openSocial(platform) {
    const links = {
        'discord': 'https://discord.gg/vCrBfRsRvb',
        'github': 'https://github.com/jeffyNoJumper?tab=repositories'
    };
    if (links[platform]) {
        window.api.openExternal(links[platform]);
        hideUserDropdown();
    }
}

function hideUserDropdown() {
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) {
        dropdown.classList.add('hidden');
        console.log("[UI] Dropdown Hidden");
    }
}

// --- SESSION CONTROL ---
function logout() {
    localStorage.removeItem('user_prefix');
    if (!document.getElementById('remember-me').checked) {
        localStorage.removeItem('license_key');
        hideUserDropdown();
    }
    location.reload();
}

function startExpiryHeartbeat(expiryDate) {
    // Clear any existing timer first
    if (expiryCheckInterval) clearInterval(expiryCheckInterval);

    const expiryTime = new Date(expiryDate).getTime();

    expiryCheckInterval = setInterval(() => {
        const now = new Date().getTime();

        if (now >= expiryTime) {
            console.log("[SECURITY] License Expired during runtime.");
            clearInterval(expiryCheckInterval);
            triggerExpirySequence();
        }
    }, 30000); // Check every 30 seconds
}

function triggerExpirySequence() {

    openModal('expiry-modal');

    document.querySelectorAll('.nav-btn').forEach(btn => btn.style.pointerEvents = 'none');

    // 3. Play a subtle error sound if you want
    // new Audio('assets/error.mp3').play();
}

function forceLogout() {

    localStorage.removeItem('user_email');
    localStorage.removeItem('license_key');

    if (expiryCheckInterval) clearInterval(expiryCheckInterval);

    location.reload();
}
