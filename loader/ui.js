// 1. Boot Screen Logic
window.onload = () => {
    let progress = 0;
    const bar = document.getElementById('boot-progress');
    const interval = setInterval(() => {
        progress += Math.random() * 15;
        bar.style.width = progress + '%';
        
        if (progress >= 100) {
            clearInterval(interval);
            switchScreen('boot-screen', 'login-screen');
        }
    }, 200);
};

function switchScreen(oldId, newId) {
    document.getElementById(oldId).classList.remove('active');
    document.getElementById(newId).classList.add('active');
}

function showTab(tabName) {
    // Update button active states
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');

    // Update tab visibility
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.getElementById(tabName + '-tab').classList.add('active');
}

// 2. Handle Login 
async function handleLogin() {
    const key = document.getElementById('license-key').value;
    const btn = document.getElementById('login-btn');
    
    if(!key) return alert("Please enter a license key.");
    
    btn.innerHTML = "FETCHING HWID...";

    try {
        // Calls C++ via Electron Bridge
        const realHWID = await window.api.getMachineIdentifier(); 

        btn.innerHTML = "VALIDATING...";

        const response = await fetch('https://sk-auth-api.up.railway.app', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ license_key: key, hwid: realHWID })
        });

        const data = await response.json();

        if (data.token) {
            localStorage.setItem('auth_token', data.token);
            localStorage.setItem('license_key', key); // Saved for HWID reset later
            document.getElementById('user-pic').src = data.profile_pic;
            document.getElementById('user-expiry').innerText = "EXP: " + new Date(data.expiry).toLocaleDateString();
            switchScreen('login-screen', 'main-dashboard');
        } else {
            alert(data.error);
            btn.innerHTML = "VALIDATE LICENSE";
        }
    } catch (err) {
        alert("Server Error: " + err.message);
        btn.innerHTML = "VALIDATE LICENSE";
    }
}

// 3. Spoofer Logic (C++ Interaction)
async function startSpoofing() {
    const statusText = document.getElementById('status-text');
    const loader = document.getElementById('spoof-progress');
    
    statusText.innerText = "INITIALIZING...";
    loader.classList.remove('hidden');

    try {
        // Call the C++ Spoofer via Electron
        const results = await window.api.startSpoof();

        if (results.disk && results.guid) {
            statusText.innerText = "SPOOFED SUCCESSFULLY";
            statusText.style.color = "#00ff88"; // Green glow
        } else {
            statusText.innerText = "SPOOF FAILED - RUN AS ADMIN";
            statusText.style.color = "#ff3e3e"; // Red glow
        }
    } catch (err) {
        statusText.innerText = "ERROR: " + err.message;
    } finally {
        loader.classList.add('hidden');
    }
}

// 4. HWID Reset Logic (API Interaction)
async function requestHWIDReset() {
    const key = localStorage.getItem('license_key');
    
    // 1. Ask for Password first
    const adminPass = prompt("Enter Admin Password to confirm reset:"); 
    if (!adminPass) return;

    // 2. Final confirmation
    if (!confirm("Are you sure you want to reset your HWID? This will unlock the key for a new PC.")) return;

    try {
        // 3. Send to the CORRECT endpoint (/reset-hwid)
        const response = await fetch('https://sk-auth-api.up.railway.app', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                license_key: key,
                admin_password: adminPass 
            })
        });

        const data = await response.json();

        if (data.success) {
            alert("HWID Reset! You can now login from a new PC.");
            // Clear local session and go back to login screen
            localStorage.removeItem('auth_token');
            location.reload(); 
        } else {
            // This will show "Unauthorized" or "Key not found" from your API
            alert("Reset Failed: " + (data.error || "Unknown Error"));
        }
    } catch (err) {
        alert("API Connection Error: " + err.message);
    }
}


// 5. Game Launch Logic
function launchGame(gameName) {
    alert("Injecting " + gameName + "...");
    window.api.launchCheat(gameName); // Triggers C++ Injection
}
