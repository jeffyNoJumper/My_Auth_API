// 1. Boot Screen Logic
window.onload = () => {
    let progress = 0;
    const bar = document.getElementById('boot-progress');
    const status = document.getElementById('boot-status');
    
    const interval = setInterval(() => {
        progress += Math.random() * 12;
        if (progress > 100) progress = 100;
        bar.style.width = progress + '%';
        
        if (progress > 30) status.innerText = "Establishing secure connection...";
        if (progress > 60) status.innerText = "Verifying system integrity...";
        if (progress > 90) status.innerText = "Bypassing anti-cheat hooks...";

        if (progress >= 100) {
            clearInterval(interval);
            setTimeout(() => switchScreen('boot-screen', 'login-screen'), 500);
        }
    }, 150);
};

// 2. Navigation & View Switching
function switchScreen(oldId, newId) {
    document.getElementById(oldId).classList.remove('active');
    document.getElementById(newId).classList.add('active');
}

function showTab(tabName) {
    // Reset buttons
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    // Set active button
    document.getElementById('btn-' + tabName).classList.add('active');

    // Reset content
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    // Show active content
    document.getElementById(tabName + '-tab').classList.add('active');
}

// 3. Authentication
async function handleLogin() {
    const key = document.getElementById('license-key').value;
    const btn = document.getElementById('login-btn');
    
    if(!key) return alert("Please enter a license key.");
    
    btn.innerHTML = `<div class="spinner"></div> VALIDATING...`;
    btn.disabled = true;

    try {
        // Get Hardware ID from C++ Bridge
        const realHWID = await window.api.getMachineIdentifier(); 

        const response = await fetch('https://sk-auth-api.up.railway.app', {
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
        alert("API Connection Error. Ensure your Railway server is live.");
        btn.innerHTML = "VALIDATE LICENSE";
        btn.disabled = false;
    }
}

// 4. Spoofer Logic
async function startSpoofing() {
    const statusText = document.getElementById('status-text');
    const loader = document.getElementById('spoof-progress');
    
    statusText.innerText = "PATCHING REGISTRY...";
    statusText.className = 'processing';
    loader.classList.remove('hidden');

    try {
        const results = await window.api.startSpoof();

        if (results.disk && results.guid) {
            statusText.innerText = "SYSTEM SPOOFED";
            statusText.className = 'active-status'; // CSS should handle green color
        } else {
            statusText.innerText = "ACCESS DENIED (RUN AS ADMIN)";
            statusText.className = 'error-status';
        }
    } catch (err) {
        statusText.innerText = "C++ BRIDGE ERROR";
    } finally {
        loader.classList.add('hidden');
    }
}

// 5. HWID Reset
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
            alert("HWID Cleared. The loader will now restart.");
            location.reload(); 
        } else {
            alert("Error: " + data.error);
        }
    } catch (err) {
        alert("Reset failed. API unreachable.");
    }
}

// 6. AUTO-UPDATER EVENTS (From Main.js)
window.api.onUpdateAvailable((version) => {
    document.getElementById('update-overlay').classList.remove('hidden');
    document.getElementById('update-version').innerText = "New version detected: v" + version;
});

window.api.onDownloadProgress((percent) => {
    const bar = document.getElementById('update-progress');
    bar.style.width = percent + '%';
    document.getElementById('update-status').innerText = `Downloading: ${Math.round(percent)}%`;
});

// 7. Injection
async function launchGame(gameName) {
    const res = await window.api.launchCheat(gameName);
    alert(res.message);
}
