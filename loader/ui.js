
const API = 'https://my-auth-api-1ykc.onrender.com';

let countdownInterval;
let progress = 0;
let newsLoaded = false;
let expiryCheckInterval = null;
let isAuthProcessActive = false;
let updateReminderInterval = null;
const currentVersion = "1.1.3";

const shell = window.api.shell;

let currentUserPrefix = localStorage.getItem('user_prefix') || "";

window.onload = async () => {

    // ---------- PROFILE SYNC ----------
    const savedPfp = localStorage.getItem('saved_profile_pic');
    const navPfp = document.getElementById('user-pic');
    const modalPfp = document.getElementById('modal-pfp');

    if (savedPfp) {
        if (navPfp) navPfp.src = savedPfp;
        if (modalPfp) modalPfp.src = savedPfp;
    }

    // ---------- INITIAL SYSTEM TASKS ----------
    await Promise.all([
        updateHWIDDisplay(),
        checkServer()
    ]);

    // ---------- VERSION CHECK ----------
    try {
        // Check if the function exists before calling it
        if (typeof checkVersion === "function") {
            await checkVersion();
        } else {
            console.warn("[UPDATE] checkVersion function is missing. Skipping...");
        }
    } catch (err) {
        console.error("[UPDATE] Version check failed:", err);
    }

    // ---------- LOADER OVERLAY ----------
    const overlay = document.getElementById('update-overlay');
    if (overlay) overlay.classList.add('hidden');

    // ---------- SESSION DATA ----------
    const savedEmail = localStorage.getItem('remembered_email');
    const savedPass = localStorage.getItem('remembered_password');
    const savedExpiry = localStorage.getItem('expiry_date');
    const rememberMe = localStorage.getItem('remember-me') === 'true';

    // ---------- ATTEMPT AUTO LOGIN ----------
    if (rememberMe && savedEmail && savedPass && savedExpiry) {

        const now = Date.now();
        const expTime = new Date(savedExpiry).getTime();

        if (now < expTime) {

            console.log("[SECURITY] Valid session found. Auto logging in...");

            const emailField = document.getElementById('login-email');
            const passField = document.getElementById('login-password');

            if (emailField) emailField.value = savedEmail;
            if (passField) passField.value = savedPass;

            const modal = document.getElementById('auto-login-modal');
            if (modal) modal.style.display = 'flex';

            const autoUser = document.getElementById('auto-login-user');
            if (autoUser) autoUser.innerText = savedEmail;

            document.body.classList.remove('login-active');
            document.body.classList.add('logged-in');

            const loginScreen = document.getElementById("login-screen");
            if (loginScreen) loginScreen.style.display = "none";

            const dashboard = document.getElementById("dashboard-wrapper");
            if (dashboard) dashboard.style.display = "flex";

            const sidebar = document.getElementById("sidebar");
            if (sidebar) {
                sidebar.style.display = "flex";
                sidebar.classList.remove("hidden");
            }

            if (typeof showTab === "function") showTab("home");

            if (typeof updateHomeTabUI === "function") {
                updateHomeTabUI();
            }

            handleLogin(true, {
                email: savedEmail,
                password: savedPass
            })
                .then(() => console.log("[SYSTEM] Auto-login complete"))
                .catch(err => console.error("[AUTOLOGIN ERROR]", err));

            return;
        }
        else {

            console.warn("[SECURITY] Session expired. Clearing stored session.");
            localStorage.clear();

        }
    }

    // ---------- MANUAL LOGIN ----------
    console.log("[SYSTEM] No valid session. Awaiting manual login.");
    document.body.classList.add('login-active');

};

function cancelAutoLogin() {
    closeModal('auto-login-modal');
    isAuthProcessActive = false;
    document.getElementById('login-email').value = '';
    document.getElementById('login-password').value = '';
}
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

    const injectionModal = document.getElementById('injection-modal');
    const bar = document.getElementById('main-progress-bar');
    const text = document.getElementById('status-text');
    const percentText = document.getElementById('status-percent');

    let injectionType = "external";

    if (prefix === "NULL" || !prefix) {
        alert("Access Denied: Please redeem a Licese key in your Profile First!!\\n");
        showtab('user-pic');
        return;
    }

    // --- CS2 MODAL LOGIC ---
    if (gameName.toLowerCase() === 'cs2') {
        const cs2Modal = document.getElementById('cs2-modal');
        cs2Modal.classList.remove('hidden'); // Open Selection

        injectionType = await new Promise((resolve) => {
            window.submitCS2Choice = (choice) => {
                cs2Modal.classList.add('hidden'); // Close Selection
                resolve(choice);
            };
        });

        if (injectionType === 'cancel') {
            addTerminalLine("> [SYSTEM] CS2 Injection cancelled.");
            return;
        }
    }

    // --- START INJECTION OVERLAY ---
    if (injectionModal && bar) {
        injectionModal.classList.remove('hidden'); // Blackout screen

        setTimeout(() => {
            bar.style.width = "45%";
            if (percentText) percentText.innerText = "45%";
            if (text) text.innerText = `COMMUNICATING WITH ${gameName.toUpperCase()}...`;
        }, 100);
    }

    addTerminalLine(`> [SYSTEM] Initializing ${gameName.toUpperCase()}...`);

    const result = await window.api.launchCheat(gameName, autoCloseActive, key, injectionType);

    if (result.status === "Success") {
        if (bar) bar.style.width = "100%";
        if (percentText) percentText.innerText = "100%";
        if (text) {
            text.innerText = "INJECTION SUCCESSFUL!";
            text.style.color = "#00ff88"; // Green for success
        }

        setTimeout(() => {
            injectionModal.classList.add('hidden');
            bar.style.width = "0%";
            percentText.innerText = "0%";
            text.style.color = "var(--accent)";
        }, 3000);
    } else {
        if (text) {
            text.innerText = "INJECTION FAILED";
            text.style.color = "#ff4444"; // Red for error
        }
        setTimeout(() => injectionModal.classList.add('hidden'), 3000);
    }

    addTerminalLine(`> ${result.status === "Success" ? "[SUCCESS]" : "[ERROR]"} ${result.message}`);
}

let resolveCS2;
function submitCS2Choice(choice) {
    if (resolveCS2) {
        resolveCS2(choice);
    }
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

function toggleShadowWarning() {
    const isChecked = document.getElementById('deep-clean').checked;
    const warning = document.getElementById('shadow-warning');
    if (isChecked) {
        warning.classList.remove('hidden');
    } else {
        warning.classList.add('hidden');
    }
}

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
                    const rawKey = localStorage.getItem('license_key');
                    const key = rawKey ? rawKey.trim().toUpperCase() : null;

                    // FIX: Added the endpoint '/update-profile' to the URL
                    const res = await fetch('https://my-auth-api-1ykc.onrender.com', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            license_key: key,
                            profile_pic: base64Image // This is the Base64 string
                        })
                    });

                    const data = await res.json();

                    if (res.ok && data.success) {
                        console.log("✅ Profile pic synced to Render DB");
                        // Optional: Update any other UI elements with the new PFP
                        if (document.getElementById('modal-pfp')) {
                            document.getElementById('modal-pfp').src = base64Image;
                        }
                    } else {
                        console.error("❌ Server rejected update:", data.error || res.statusText);
                    }
                } catch (err) {
                    console.error("❌ Network or Server Error:", err);
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
        oldScreen.style.display = 'none';
        oldScreen.style.zIndex = '-1';
    }

    if (newScreen) {
        newScreen.classList.add('active');
        newScreen.style.display = 'flex';
        newScreen.style.zIndex = '10';
    }

    if (newId === 'main-dashboard') {
        const usernameEl = document.getElementById("profile-username");
        const avatarEl = document.getElementById("profile-pic");

        if (usernameEl) usernameEl.innerText = localStorage.getItem("username") || "Guest";
        if (avatarEl) avatarEl.src = localStorage.getItem("profilePic") || "imgs/default-avatar.png";
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

function showTab(tabName) {

    // ---------- HIDE ALL TABS ----------
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
        tab.style.display = 'none';
    });

    const selectedTab = document.getElementById(tabName + '-tab');

    if (selectedTab) {

        selectedTab.classList.add('active');

        // Handle special layouts
        if (tabName === "settings") {
            selectedTab.style.display = "grid";
        } else {
            selectedTab.style.display = "block";
        }

    }

    // ---------- MODULE HOOKS ----------

    // HOME TAB
    if (tabName === "home") {

        if (typeof updateHomeTabUI === "function") {
            updateHomeTabUI();
        }

        const rpcEnabled = localStorage.getItem("discord-rpc") === "true";

        if (rpcEnabled && window.api?.toggleDiscord) {
            window.api.toggleDiscord(true);
        }
    }

    // HWID TAB
    if (tabName === "hwid") {
        if (typeof updateHWIDDisplay === "function") {
            updateHWIDDisplay();
        }
    }

    // SETTINGS TAB
    if (tabName === "settings") {
        if (typeof loadNews === "function") {
            loadNews();
        }
    }

    // ---------- CLOSE DROPDOWNS ----------
    const dropdown = document.getElementById("user-dropdown");
    if (dropdown) dropdown.classList.add("hidden");

    console.log(`[UI] Switched to ${tabName.toUpperCase()} module.`);
}

async function updateHWIDDisplay() {
    try {
        console.log("Refreshing Hardware Terminal...");

        const hwidElem = document.getElementById('hwid-id');
        const serialElem = document.getElementById('serial-id');
        const gpuElem = document.getElementById('gpu-id');

        if (hwidElem) hwidElem.innerText = "FETCHING...";
        if (serialElem) serialElem.innerText = "FETCHING...";
        if (gpuElem) gpuElem.innerText = "FETCHING...";

        await new Promise(r => setTimeout(r, 800));

        const hwid = await window.api.getMachineID();
        const serial = await window.api.getSerial();   // changed
        const gpu = await window.api.getGPU();         // changed

        if (hwidElem) hwidElem.innerText = hwid || "N/A";
        if (serialElem) serialElem.innerText = serial || "N/A";
        if (gpuElem) gpuElem.innerText = gpu || "N/A";

        console.log("Terminal Refreshed. New HWID:", hwid);

    } catch (err) {
        console.error("Failed to update terminal:", err);
    }
}

async function handleLogin(isAutoLogin = false, creds = {}) {
    if (isAuthProcessActive && !isAutoLogin) return;

    // ---------- DETERMINE CREDENTIALS ----------
    const email = isAutoLogin ? creds.email : document.getElementById('login-email')?.value;
    const password = isAutoLogin ? creds.password : document.getElementById('login-password')?.value;
    const rememberMe = document.getElementById('remember-me')?.checked;
    const btn = document.getElementById('login-btn');

    if (!email || !password) {
        if (!isAutoLogin) alert("Enter Email and Password");
        return;
    }

    isAuthProcessActive = true;

    // Spinner for manual login
    if (btn && !isAutoLogin) {
        btn.innerHTML = `<div class="spinner"></div>`;
        btn.disabled = true;
    }

    try {
        const hwid = await window.api.getMachineID();

        const res = await fetch("https://my-auth-api-1ykc.onrender.com/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, hwid })
        });

        const data = await res.json();

        if (data.token === "VALID") {
            console.log("[AUTH] LOGIN SUCCESS");

            // ---------- HIDE AUTO LOGIN MODAL ----------
            document.getElementById("auto-login-modal")?.style.setProperty("display", "none");

            // ---------- SAVE SESSION ----------
            localStorage.setItem("user_email", email);
            localStorage.setItem("expiry_date", data.expiry);

            if (rememberMe || isAutoLogin) {
                localStorage.setItem("remembered_email", email);
                localStorage.setItem("remembered_password", password);
            }

            if (data.license_key) {
                localStorage.setItem("license_key", data.license_key.toUpperCase());
            }

            // ---------- PROFILE ----------
            const profilePic = data.profile_pic || "imgs/default-profile.png";
            localStorage.setItem("saved_profile_pic", profilePic);

            document.querySelectorAll("#user-pic, #modal-pfp")
                .forEach(img => img.src = profilePic);

            // ---------- USER INFO ----------
            const username = email.split("@")[0];

            const profileName = document.getElementById("user-display-name");
            if (profileName) profileName.innerText = username;

            const navName = document.getElementById("nav-username");
            if (navName) navName.innerText = username;

            const expiryDisplay = document.getElementById("user-expiry");
            if (expiryDisplay)
                expiryDisplay.innerText = "EXP: " + new Date(data.expiry).toLocaleDateString();

            const homeExpiry = document.getElementById("home-exp");
            if (homeExpiry)
                homeExpiry.innerText = new Date(data.expiry).toLocaleDateString();

            // ---------- UPDATE HOME TAB GREETING ----------
            if (typeof updateHomeTabUI === "function") {
                updateHomeTabUI();
            }

            // ---------- START EXPIRY HEARTBEAT ----------
            if (typeof startExpiryHeartbeat === "function") {
                startExpiryHeartbeat(data.expiry);
            }

            // ---------- SWITCH UI ----------
            document.body.classList.remove("login-active");
            document.body.classList.add("logged-in");

            document.getElementById("login-screen")?.style.setProperty("display", "none");
            document.getElementById("dashboard-wrapper")?.style.setProperty("display", "flex");

            const sidebar = document.getElementById("sidebar");
            if (sidebar) {
                sidebar.style.display = "flex";
                sidebar.classList.remove("hidden");
            }

            // Show default tab
            if (typeof showTab === "function") showTab("home");

            console.log("[SYSTEM] Dashboard loaded successfully.");
        }
        else {
            document.getElementById("auto-login-modal")?.style.setProperty("display", "none");

            if (!isAutoLogin)
                alert("Login Failed: " + (data.error || "Invalid credentials"));
        }

    } catch (err) {
        console.error("[AUTH ERROR]", err);
        if (!isAutoLogin) alert("API Connection Error");
    }
    finally {
        isAuthProcessActive = false;

        if (btn && !isAutoLogin) {
            btn.innerHTML = "LOGIN";
            btn.disabled = false;
        }
    }
}

async function updateUserInfoDisplay(email, status = "Online") {
    // 1. Get the actual hardware ID from the computer
    const realHWID = await window.api.getMachineID();
    
    // 2. Select the elements from your HTML
    const emailEl = document.getElementById('info-email');
    const hwidEl = document.getElementById('info-hwid');
    const statusEl = document.getElementById('manage-status');

    // 3. Apply the Updates
    if (emailEl) emailEl.innerText = email;

    if (hwidEl) {
        hwidEl.innerText = realHWID; // Replace PENDING_HWID
        hwidEl.style.color = "var(--accent)"; // Change color to #0095ff
        hwidEl.style.textShadow = "0 0 8px var(--accent-glow)"; // Add a subtle glow
    }

    if (statusEl) {
        statusEl.innerText = status;
        statusEl.style.color = "var(--accent)"; // Change from Red to Blue
    }
}

function updateHomeTabUI() {

    const email = localStorage.getItem("user_email");
    const expiry = localStorage.getItem("expiry_date");

    const welcomeText = document.getElementById("home-welcome");
    const homeExp = document.getElementById("home-exp");

    const sidebarName = document.getElementById("user-display-name");

    if (sidebarName && email) {
        const username = email.split("@")[0];
        sidebarName.innerText = username;
    }

    // ---------- USERNAME ----------
    if (welcomeText) {

        if (email) {
            const username = email.split("@")[0].toUpperCase();
            welcomeText.innerText = `Welcome back, ${username}`;
        } else {
            welcomeText.innerText = "Welcome back";
        }

    }

    // ---------- SUBSCRIPTION EXPIRY ----------
    if (homeExp) {

        if (expiry) {
            const date = new Date(expiry).toLocaleDateString();
            homeExp.innerText = date;
            homeExp.style.color = "#1abc9c";
        } else {
            homeExp.innerText = "No Active Subscription";
            homeExp.style.color = "#ff5c5c";
        }
    }

    // ---------- SIDEBAR EXPIRY ----------
    const sidebarExpiry = document.getElementById("user-expiry");

    if (sidebarExpiry) {
        if (expiry) {
            sidebarExpiry.innerText = "EXP: " + new Date(expiry).toLocaleDateString();
        } else {
            sidebarExpiry.innerText = "EXP: NONE";
        }
    }

    console.log("[HOME] UI Synced:", {
        email: email,
        expiry: expiry
    });
}


async function handleRegister() {
    const email = document.getElementById('reg-email').value.trim();
    const pass = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;
    const btn = document.getElementById('register-btn');

    // ---------- BASIC FIELD CHECKS ----------
    if (!email || !pass || !confirm) return alert("All fields are required!");
    if (pass !== confirm) return alert("Passwords do not match!");

    // ---------- EMAIL FORMAT VALIDATION ----------
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return alert("Please enter a valid email address.");
    }

    // ---------- OPTIONAL: FRONTEND EMAIL VERIFICATION ----------
    try {
        // Kickbox / similar service API example
        const verifyRes = await fetch(`https://open.kickbox.com/v1/disposable/${email}`);
        const verifyData = await verifyRes.json();

        if (verifyData.disposable) {
            return alert("Disposable or fake emails are not allowed. Use a real email.");
        }
    } catch (err) {
        console.warn("[EMAIL VERIFY] Could not verify email, proceeding anyway.", err);
        // optional: continue registration or block
    }

    btn.innerHTML = `<div class="spinner"></div> CREATING...`;
    btn.disabled = true;

    try {
        const hwid = await window.api.getMachineID();

        // ---------- SEND TO BACKEND ----------
        const response = await fetch('https://my-auth-api-1ykc.onrender.com/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: email,
                password: pass,
                hwid: hwid
            })
        });

        const data = await response.json();

        if (data.status === "Success") {
            alert("Account Created! You can now log in.");
            closeModal('register-modal');
        } else if (data.error === "invalid_email") {
            alert("Registration Failed: Email is invalid or disposable.");
        } else {
            alert("Registration Failed: " + (data.error || "Unknown error"));
        }

    } catch (err) {
        console.error("Register Error:", err);
        alert("Failed to connect to registration server.");
    } finally {
        btn.innerHTML = "REGISTER NOW";
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
        'FiveM': 'FIVM',
        'GTAV': 'GTAV',     // Changed from GTAX to GTAV to match your server
        'WARZONE': 'WARZ',  // Changed from WZX to WARZ to match your server
        'FORTNITE': 'FRTX'
    };

    const prefix = currentUserPrefix || localStorage.getItem('user_prefix');

    // ALLX bypasses all checks
    if (prefix === "ALLX") return true;

    if (prefix === accessMap[gameName]) {
        return true;
    }

    alert(`Access Denied! Your key (${prefix}) is not valid for ${gameName}.`);
    return false;
}

function setSessionAccess(key) {
    // If no key exists yet (User just logged in with email/pass)
    if (!key || !key.includes('-')) {
        console.log("[AUTH] No active license. Access restricted until redemption.");

        currentUserPrefix = "";
        localStorage.setItem('user_prefix', "NULL");
        localStorage.removeItem('license_key');
        return;
    }

    // If they have redeemed a key: "CS2X-C567" -> "CS2X"
    currentUserPrefix = key.split('-')[0].toUpperCase();
    localStorage.setItem('user_prefix', currentUserPrefix);
    localStorage.setItem('license_key', key.toUpperCase());

    console.log(`[AUTH] License Active. Session Prefix: ${currentUserPrefix}`);
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
async function openModal(id) {
    const modal = document.getElementById(id);
    const dropdown = document.getElementById('user-dropdown');

    if (modal) {
        modal.classList.remove('hidden');
        if (dropdown) dropdown.classList.add('hidden');

        // --- NEW: Sync Data for Settings Modal ---
        if (id === 'settings-modal') {
            const currentPfp = document.getElementById('user-pic').src;
            const modalPfp = document.getElementById('modal-pfp');
            if (modalPfp) modalPfp.src = currentPfp;

            const hwidDisplay = document.getElementById('settings-hwid-display');
            if (hwidDisplay) {
                try {
                    const realHWID = await window.api.getMachineID();
                    hwidDisplay.innerText = realHWID;
                } catch (err) {
                    hwidDisplay.innerText = "ERROR FETCHING HWID";
                }
            }
        }

        console.log("✅ Modal Opened:", id);
    } else {
        console.error("❌ Modal ID not found:", id);
    }
}

async function redeemNewKey() {
    const newKey = document.getElementById('edit-license-key')?.value;
    const email = localStorage.getItem('user_email');
    const redeemBtn = document.getElementById('redeem-key-btn');
    const hwidDisplay = document.getElementById('settings-hwid-display');

    if (!newKey) return alert("Please enter a valid license key!");

    if (redeemBtn) {
        redeemBtn.innerText = "REDEEMING...";
        redeemBtn.disabled = true;
    }

    try {
        const hwid = await window.api.getMachineID();
        if (hwidDisplay) hwidDisplay.innerText = hwid;

        const response = await fetch('https://my-auth-api-1ykc.onrender.com/redeem', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, license_key: newKey, hwid })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Server Error Response:", errorText);
            throw new Error(`Server error (${response.status}).`);
        }

        const data = await response.json();

        if (data.status === "Success") {
            alert("Subscription Updated Successfully!");

            // 1. Update the stored license key string
            localStorage.setItem('license_key', newKey);
            localStorage.setItem('expiry_date', data.new_expiry);

            // 2. CRITICAL: Update the prefix (e.g., change from CS2X to ALLX)
            setSessionAccess(newKey);

            // 3. Refresh UI & Heartbeat
            if (typeof startExpiryHeartbeat === 'function') startExpiryHeartbeat(data.new_expiry);
            if (typeof updateUIForAccess === 'function') updateUIForAccess();

            closeModal('settings-modal');
            console.log(`[AUTH] Key Upgraded to: ${newKey}`);
        } else {
            // Handle logical errors (Invalid Key, Already Used, etc.)
            alert("Redeem Failed: " + (data.error || "Unknown Error"));
        }
    } catch (err) {
        console.error("Redeem Error:", err);
        alert("Connection Error: " + err.message);
    } finally {
        // ALWAYS reset the button so the user can try again if it fails
        if (redeemBtn) {
            redeemBtn.innerText = "REDEEM KEY";
            redeemBtn.disabled = false;
        }
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
    const emailInput = document.getElementById('edit-email');
    const passwordInput = document.getElementById('edit-password');
    const btn = document.getElementById('save-profile-btn');

    if (!btn) return console.warn("Save button not found!");

    const savedKey = localStorage.getItem('license_key');
    if (!savedKey) {
        alert("Session Error: No active login found. Please restart the app.");
        return;
    }

    btn.innerText = "SAVING...";
    btn.disabled = true;

    try {
        const cleanAPI = API.replace(/\/$/, "");

        const response = await fetch(`${cleanAPI}/update-profile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                license_key: savedKey.trim().toUpperCase(),
                email: emailInput?.value || null,
                password: passwordInput?.value || null,
                profile_pic: window.tempPfp || null
            })
        });

        const contentType = response.headers.get("content-type");
        if (!response.ok || !contentType || !contentType.includes("application/json")) {
            throw new Error(`Server Error: ${response.status}`);
        }

        const data = await response.json();

        if (data.success) {
            if (emailInput?.value) localStorage.setItem('user_email', emailInput.value);

            if (window.tempPfp) {
                localStorage.setItem('saved_profile_pic', window.tempPfp);
                const pfpElements = document.querySelectorAll('#user-pic, #modal-pfp');
                pfpElements.forEach(img => {
                    if (img) img.src = window.tempPfp;
                });
            }

            alert("Success! Profile updated.");
            closeModal?.('settings-modal');
        } else {
            alert("Error: " + (data.error || "Unknown Error"));
        }
    } catch (e) {
        console.error("Save Profile Error:", e);
        alert("Failed to connect to server. Check your connection.");
    } finally {
        btn.innerText = "SAVE CHANGES";
        btn.disabled = false;
    }
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
    const isDeepClean = document.getElementById("deep-clean").checked;

    if (spoofState === "running") return;

    if (isDeepClean) {
        const confirmClean = window.confirm(
            "WARNING: Deep Clean will wipe game logs and traces.\n\n" +
            "To escape a shadow ban, you MUST use a NEW game account after this.\n" +
            "Logging into a flagged account will RE-BAN your hardware immediately.\n\n" +
            "Do you wish to proceed?"
        );

        if (!confirmClean) return;
    }

    spoofState = "running";
    loader.classList.remove("hidden");

    try {

        // ⭐ READ selected games from modal storage
        const deepCleanGames = JSON.parse(localStorage.getItem("deepclean_games") || "{}");

        const options = {
            motherboard: document.getElementById("motherboard-select").value,
            biosFlash: document.getElementById("bios-flash").checked,
            cleanReg: document.getElementById("clean-reg").checked,
            cleanDisk: document.getElementById("clean-disk").checked,
            deepClean: isDeepClean,

            user: currentSpoofMode === "hwid",
            disk: currentSpoofMode === "traces",

            // ⭐ GAME CLEAN FLAGS
            cleanCS2: deepCleanGames.cs2 || false,
            cleanGTAV: deepCleanGames.gtav || false,
            cleanFiveM: deepCleanGames.fivem || false,
            cleanCOD: deepCleanGames.cod || false
        };

        const result = await window.api.startSpoof(options);

        loader.classList.add("hidden");

        if (result && result.success) {

            updateSpoofStatus(currentSpoofMode === "hwid" ? "perm" : "temp");

            localStorage.setItem(
                "spoofState",
                currentSpoofMode === "hwid" ? "perm" : "temp"
            );

            alert("Spoof Complete! Please RESTART your PC before launching the game.");

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

const motherboardSelect = document.getElementById("motherboard-select");
const mbIcon = document.getElementById("mb-icon");

const motherboardIcons = {
    asus: "imgs/asus.png",
    msi: "imgs/msi.png",
    gigabyte: "imgs/gigabyte.png",
    asrock: "imgs/asrock.png",
    other: "imgs/motherboard.png"
};

motherboardSelect.addEventListener("change", () => {
    const brand = motherboardSelect.value;
    mbIcon.src = motherboardIcons[brand] || motherboardIcons.other;
});

const biosToggle = document.getElementById("bios-flash");
const biosModal = document.getElementById("biosflash-modal");
const biosConfirm = document.getElementById("biosflash-confirm");
const biosCancel = document.getElementById("biosflash-cancel");

biosToggle.addEventListener("click", (e) => {

    if (!biosToggle.checked) return;

    e.preventDefault();
    biosModal.classList.remove("hidden");

});

biosConfirm.addEventListener("click", () => {
    biosToggle.checked = true;
    biosModal.classList.add("hidden");
});

biosCancel.addEventListener("click", () => {
    biosToggle.checked = false;
    biosModal.classList.add("hidden");
});

const regToggle = document.getElementById("clean-reg");
const regModal = document.getElementById("registryclean-modal");

const diskToggle = document.getElementById("clean-disk");
const diskModal = document.getElementById("diskclean-modal");


// REGISTRY CLEAN
regToggle.addEventListener("click", (e) => {

    if (!regToggle.checked) return;

    e.preventDefault();
    regModal.classList.remove("hidden");

});

document.getElementById("registryclean-confirm").onclick = () => {
    regToggle.checked = true;
    regModal.classList.add("hidden");
};

document.getElementById("registryclean-cancel").onclick = () => {
    regToggle.checked = false;
    regModal.classList.add("hidden");
};


// DISK TRACE CLEAN
diskToggle.addEventListener("click", (e) => {

    if (!diskToggle.checked) return;

    e.preventDefault();
    diskModal.classList.remove("hidden");

});

document.getElementById("diskclean-confirm").onclick = () => {
    diskToggle.checked = true;
    diskModal.classList.add("hidden");
};

document.getElementById("diskclean-cancel").onclick = () => {
    diskToggle.checked = false;
    diskModal.classList.add("hidden");
};

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
            cleanDisk: true,
            deepClean: true
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

const deepCleanToggle = document.getElementById("deep-clean");
const deepCleanModal = document.getElementById("deepclean-modal");

deepCleanToggle?.addEventListener("change", () => {

    if (deepCleanToggle.checked) {

        document.getElementById("deepclean-warning")?.classList.remove("hidden");

        if (deepCleanModal) {
            deepCleanModal.classList.remove("hidden");
        }

    } else {

        document.getElementById("deepclean-warning")?.classList.add("hidden");

    }

});

document.getElementById("deepclean-save")?.addEventListener("click", () => {

    const selections = {
        cs2: document.getElementById("clean-cs2")?.checked || false,
        gtav: document.getElementById("clean-gtav")?.checked || false,
        fivem: document.getElementById("clean-fivem")?.checked || false,
        cod: document.getElementById("clean-cod")?.checked || false
    };

    localStorage.setItem("deepclean_games", JSON.stringify(selections));

    document.getElementById("deepclean-modal").classList.add("hidden");

});

document.getElementById("deepclean-cancel")?.addEventListener("click", () => {

    document.getElementById("deepclean-modal").classList.add("hidden");

});

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
        terminal.innerHTML = '<div id="news-feed-text" class="typewriter">> [SYSTEM] Logs cleared. Bufferring for reset...</div>';
        newsLoaded = false;
        console.log("[UI] Terminal logs cleared by user.");
    }
}
function resetConfig() {
    const confirmed = confirm("WARNING: This will reset all saved settings and preferences and preforme a restart of the loader. Continue?");

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

window.api.onApplyStreamProof((enabled) => {
    // Select the specific elements you want to "hide" from the stream
    const sensitiveUI = document.querySelectorAll('.accent-text, .terminal-box, .glow-text-cyan');

    sensitiveUI.forEach(el => {
        if (enabled) {
            el.style.filter = "blur(15px)"; // Blurs the text
            el.style.opacity = "0.05";     // Makes it almost invisible
            el.style.pointerEvents = "none"; // Prevents clicking while hidden
        } else {
            el.style.filter = "none";
            el.style.opacity = "1";
            el.style.pointerEvents = "auto";
        }
    });

    console.log(`[UI] Stream Proof Visibles: ${enabled ? 'HIDDEN' : 'VISIBLE'}`);
});

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
    // Clear the session data so auto-login can't trigger
    localStorage.removeItem('user_email');
    localStorage.removeItem('license_key');
    localStorage.removeItem('remembered-password')

    document.getElementById('info-email').innerText = "---";
    document.getElementById('info-hwid').innerText = "PENDING_HWID";
    document.getElementById('info-hwid').style.color = "#607d8b";
    document.getElementById('info-hwid').style.textShadow = "none";
    document.getElementById('manage-status').innerText = "Offline";
    document.getElementById('manage-status').style.color = "var(--red)";

    // Stop the expiry background check
    if (typeof expiryCheckInterval !== 'undefined' && expiryCheckInterval) {
        clearInterval(expiryCheckInterval);
    }

    // 3. Clear the Discord status (optional but recommended)
    if (window.api && window.api.toggleDiscord) {
        window.api.toggleDiscord(false);
    }

    // Hide the main dashboard
    const mainApp = document.getElementById('main-app');
    if (mainApp) mainApp.style.display = 'none';

    // Show the login screen
    const loginPanel = document.getElementById('login-panel');
    if (loginPanel) {
        loginPanel.style.display = 'block';

        // Clear the input field so they have to re-type/paste
        const keyInput = document.getElementById('license-key');
        if (keyInput) {
            keyInput.value = '';
            keyInput.placeholder = "ENTER NEW LICENSE KEY...";
        }
    }

    console.log("> [AUTH] Session terminated. Returning to login...");
}

document.addEventListener("DOMContentLoaded", () => {
    const versionLabel = document.getElementById("loader-version");
    if (versionLabel) versionLabel.innerText = currentVersion;

    checkVersion();

    // ===== AUTO-UPDATE TOGGLE =====
    const autoUpdateCheckbox = document.getElementById('auto-update-loader');
    if (autoUpdateCheckbox) {
        const autoUpdateEnabled = localStorage.getItem('autoUpdateLoader') === 'true';
        autoUpdateCheckbox.checked = autoUpdateEnabled;

        autoUpdateCheckbox.addEventListener('change', () => {
            localStorage.setItem('autoUpdateLoader', autoUpdateCheckbox.checked);
        });

        if (autoUpdateEnabled) {
            checkForUpdates();
        }
    }
});

// ==== AUTO-UPDATE FUNCTION ====
async function checkForUpdates() {
    try {
        const latest = await window.api.checkVersion(currentVersion);
        if (latest) {
            const filePath = await window.api.downloadUpdate(latest.url);
            await window.api.runUpdate(filePath);
        }
    } catch (err) {
        console.error('Auto-update failed:', err);
    }
}

// ==== UPDATE MODAL FUNCTIONS ====
async function updateNow() {

    try {

        const release = await window.api.getLatestRelease();

        const filePath = await window.api.downloadUpdate(
            release.url,
            release.name
        );

        await window.api.runUpdate(filePath);

        alert("Update downloaded. Installer launching.");

        setTimeout(() => {
            closeModal('update-modal');
        }, 2000);

        window.close();

    } catch (err) {

        console.error("Update failed:", err);
        alert("Update failed. Try again.");

    }
}

function updateLater() {
    const autoUpdateEnabled = localStorage.getItem('autoUpdateLoader') === 'true';

    // Hide the modal immediately
    document.getElementById("update-modal").classList.add("hidden");

    if (autoUpdateEnabled) return;

    // Otherwise, schedule reminder toast every 5 minutes
    if (!updateReminderInterval) {
        updateReminderInterval = setInterval(() => {
            showUpdateReminder();
        }, 5 * 60 * 1000); // 5 minutes
    }
}

async function checkVersion() {
    // Placeholder for future update logic
    console.log("[SYSTEM] Version check initialized (no logic yet).");
    return true;
}


function showUpdateReminder() {
    if (document.querySelector(".toast-notification")) return;
    createToast(
        "Update Available!",
        "Click here to open the update modal.",
        () => document.getElementById("update-modal").classList.toggle("hidden")
    );
}

function createToast(title, message, onClick) {
    const toast = document.createElement("div");
    toast.classList.add("toast-notification");
    toast.innerHTML = `<strong>${title}</strong><p>${message}</p>`;
    toast.addEventListener("click", () => {
        if (onClick) onClick();
        toast.remove();
    });
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 7000);
}

const fixDates = (data) => {
    for (let key in data) {
        // Check if the value is the MongoDB {$date: ...} object
        if (data[key] && typeof data[key] === 'object' && data[key].$date) {
            data[key] = new Date(data[key].$date);
        }
    }
    return data;
};
