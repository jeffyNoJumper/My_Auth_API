// 1. Boot Screen Logic
window.onload = () => {
    let progress = 0;
    const bar = document.getElementById('boot-progress');
    const status = document.getElementById('boot-status');

    const interval = setInterval(() => {
        progress += Math.random() * 12;
        if (progress > 100) progress = 100;
        bar.style.width = progress + '%';

        if (progress > 30) status.innerText = "Establishing secure API connection...";
        if (progress > 60) status.innerText = "Verifying system integrity...";
        if (progress > 90) status.innerText = "Bypassing Anti-Cheat Hooks...";

        if (progress >= 100) {
            clearInterval(interval);
            setTimeout(() => {
                switchScreen('boot-screen', 'login-screen');
                loadGlobalNews(); // Pre-fetch news while at login
            }, 500);
        }
    }, 300);
};

// 2. Navigation & News Feed Logic
function switchScreen(oldId, newId) {
    document.getElementById(oldId).classList.remove('active');
    document.getElementById(newId).classList.add('active');
}

// TERMINAL TYPEWRITER EFFECT
function typeNews(text) {
    const newsContainer = document.getElementById('news-feed-text');
    if (!newsContainer) return;

    newsContainer.innerHTML = "";
    let i = 0;
    const speed = 30; // ms per character

    function type() {
        if (i < text.length) {
            newsContainer.innerHTML += text.charAt(i);
            i++;
            setTimeout(type, speed);
        }
    }
    type();
}

async function loadGlobalNews() {
    try {
        // Fetches from the GitHub Release notes via Electron Main
        const updateInfo = await window.api.getNews();
        if (updateInfo && updateInfo.releaseNotes) {
            typeNews(updateInfo.releaseNotes);
        } else {
            typeNews("> SYSTEM ONLINE: No new announcements at this time.");
        }
    } catch (err) {
        typeNews("> ERROR: Could not reach News Server.");
    }
}

function showTab(tabName) {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('btn-' + tabName).classList.add('active');

    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.getElementById(tabName + '-tab').classList.add('active');

    // Refresh news if clicking back to dashboard/settings where news is shown
    if (tabName === 'settings') loadGlobalNews();
}

// 3. Authentication
async function handleLogin() {
    const key = document.getElementById('license-key').value;
    const btn = document.getElementById('login-btn');

    if (!key) return alert("Please enter a license key.");

    btn.innerHTML = `<div class="spinner"></div> VALIDATING...`;
    btn.disabled = true;

    try {
        const realHWID = await window.api.getMachineIdentifier();

        const response = await fetch('https://sk-auth-api.up.railway.app/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ license_key: key, hwid: realHWID })
        });

        const data = await response.json();

        if (data.token) {
            localStorage.setItem('license_key', key);
            document.getElementById('user-pic').src = data.profile_pic;
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

// 4. Spoofer & HWID Reset (Corrected Endpoints)
async function startSpoofing() {
    const statusText = document.getElementById('status-text');
    const loader = document.getElementById('spoof-progress');
    statusText.innerText = "PATCHING REGISTRY...";
    loader.classList.remove('hidden');

    try {
        const results = await window.api.startSpoof();
        if (results.disk && results.guid) {
            statusText.innerText = "SYSTEM SPOOFED";
            statusText.style.color = "#00ff88";
        } else {
            statusText.innerText = "FAILED - RUN AS ADMIN";
            statusText.style.color = "#ff3e3e";
        }
    } catch (err) {
        statusText.innerText = "BRIDGE ERROR";
    } finally {
        loader.classList.add('hidden');
    }
}

async function requestHWIDReset() {
    const key = localStorage.getItem('license_key');
    const adminPass = prompt("Enter Admin Secret to unlock HWID:");
    if (!adminPass) return;

    try {
        const response = await fetch('https://sk-auth-api.up.railway.app', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ license_key: key, admin_password: adminPass })
        });

        const data = await response.json();
        if (data.success) {
            alert("HWID Cleared Successfully.");
            location.reload();
        } else {
            alert("Error: " + data.error);
        }
    } catch (err) {
        alert("Reset failed. API unreachable.");
    }
}

// 5. AUTO-UPDATER UI LOGIC
window.api.onUpdateAvailable((data) => {
    // Show the update overlay
    document.getElementById('update-overlay').classList.remove('hidden');
    document.getElementById('update-version').innerText = `Update Found: v${data.version}`;

    // Add the release notes to the update description
    if (data.news) {
        document.getElementById('update-status').innerText = data.news;
    }
});

async function startUpdateDownload() {
    document.getElementById('update-btn').disabled = true;
    document.getElementById('update-status').innerText = "Starting download...";
    // Trigger the actual download in Main.js
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

// 6. Injection
async function launchGame(gameName) {
    const res = await window.api.launchCheat(gameName);
    alert(res.message);
}
