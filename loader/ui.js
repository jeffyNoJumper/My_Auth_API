const API = 'https://sk-auth-api.up.railway.app';

// 1. Boot Screen Logic
window.onload = () => {
    updateHWIDDisplay();
    let progress = 0;
    const bootScreen = document.getElementById('boot-screen');
    const bar = document.getElementById('boot-progress');
    const status = document.getElementById('boot-status');
    document.addEventListener('DOMContentLoaded', updateHWIDDisplay);

    if (bootScreen) {
        bootScreen.style.display = 'flex';
        bootScreen.style.opacity = '1';
        bootScreen.style.zIndex = '10002';
    } else {
        // If there's no boot screen, just skip to login
        switchScreen('boot-screen', 'login-screen');
        return;
    }

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
            
            // 1. Start Fade Out
            if (bootScreen) {
                bootScreen.style.opacity = '0';
                bootScreen.style.pointerEvents = 'none'; 
                bootScreen.style.transition = 'opacity 0.5s ease, visibility 0.5s';
            }

            // 2. Wait for fade (500ms) then switch screens
            setTimeout(() => {
                switchScreen('boot-screen', 'login-screen');
                
                // 3. COMPLETE REMOVAL
                if (bootScreen) {
                    bootScreen.style.display = 'none'; 
                    bootScreen.style.visibility = 'hidden'; 
                    bootScreen.style.zIndex = '-1'; 
                    bootScreen.innerHTML = ''; 
                }
                
                // 4. Force the Login/Main screens to be interactive and visible
                const loginScreen = document.getElementById('login-screen');
                if (loginScreen) {
                    loginScreen.style.zIndex = '2';
                    loginScreen.style.opacity = '1';
                }
                
                loadGlobalNews(); 
            }, 500);
        }
    }, 600);
}; 

async function loginUser() {
    const key = document.getElementById('key-input').value; // user-entered key
    const hwid = getHWID(); // your HWID function

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
            // continue to load your app/game
        } else {
            alert("Login Failed: " + data.error);
        }
    } catch (err) {
        console.error(err);
        alert("Connection to server failed!");
    }
}


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


window.addEventListener('DOMContentLoaded', () => {
    const userPic = document.getElementById('user-pic');
    const profileUpload = document.getElementById('profile-upload');

    // On Load: Use the key from localStorage to "remember" them
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
                
                // 1. Update UI immediately
                userPic.src = base64Image;
                localStorage.setItem('saved_profile_pic', base64Image);

                // 2. Sync to MongoDB via your API
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
        // We reuse the startSpoof bridge but you can create a specific reset one
        const results = await window.api.startSpoof();
        if (results) {
            statusText.innerText = "HWID RESET COMPLETED";
            // Important: Refresh the info display immediately
            await updateHWIDDisplay();
        }
    } catch (err) {
        statusText.innerText = "RESET FAILED: CONTACT SUPPORT";
    }
});


// Updated Navigation Logic for 5 Tabs
function showTab(tabName) {
    // 1. Reset all buttons
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    // 2. Hide all content areas
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
        // Ensure display is toggled if your CSS doesn't handle .active visibility
        tab.style.display = 'none';
    });

    // 3. Activate the chosen button and tab
    const selectedBtn = document.getElementById('btn-' + tabName);
    const selectedTab = document.getElementById(tabName + '-tab');

    if (selectedBtn && selectedTab) {
        selectedBtn.classList.add('active');
        selectedTab.classList.add('active');
        selectedTab.style.display = 'block';
    }

    // 4. Tab-Specific Logic
    if (tabName === 'settings') loadGlobalNews();
    if (tabName === 'hwid') updateHWIDDisplay();
}

async function updateHWIDDisplay() {
    try {
        console.log("Refreshing Hardware Terminal...");

        // 1. Get the data from the Bridge
        const hwid = await window.api.getMachineID();
        const serial = await window.api.getBaseboard();
        const gpu = await window.api.getGPUID();

        // 2. Target the spans in your HTML
        const hwidElem = document.getElementById('hwid-id');
        const serialElem = document.getElementById('serial-id');
        const gpuElem = document.getElementById('gpu-id');

        // 3. Update the text if the elements exist
        if (hwidElem) hwidElem.innerText = hwid || "N/A";
        if (serialElem) serialElem.innerText = serial || "N/A";
        if (gpuElem) gpuElem.innerText = gpu.replace(/&amp;/g, '&');

        console.log("Terminal Refreshed Successfully.");
    } catch (err) {
        console.error("Failed to update terminal:", err);
    }
}




// 3. Authentication
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
            // 1. Save credentials and profile to LocalStorage
            localStorage.setItem('license_key', key);
            if (data.profile_pic) {
                localStorage.setItem('saved_profile_pic', data.profile_pic);
            }

            // 2. Update UI
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

    // Auto-fill the license key if it exists
    if (savedKey && licenseInput) {
        licenseInput.value = savedKey;
    }

    // Pre-load the profile picture so it's not black
    if (savedPic && userPic) {
        userPic.src = savedPic;
    } else if (userPic) {
        userPic.src = 'imgs/default-profile.png';
    }
});


// Function for the Spoofing Tab
async function startSpoofing() {
    // Target only the elements in the Spoofing tab
    const mainStatus = document.getElementById('spoofer-status');
    const loader = document.getElementById('spoof-progress');

    // 1. Enter Processing State
    mainStatus.innerText = "INITIALIZING...";
    mainStatus.className = "processing"; // Triggers Gold color
    loader.classList.remove('hidden');

    try {
        // 2. Call C++ Bridge
        const results = await window.api.startSpoof();

        if (results && (results.disk || results.guid)) {
            // 3. Success State (ACTIVE)
            mainStatus.innerText = "SPOOFED SUCCESFULLY";
            mainStatus.className = "active-status"; // Triggers Green Pulse

            console.log("Spoofing Active. Identity tab left untouched.");
        } else {
            // 4. Failure State
            mainStatus.innerText = "FAILED";
            mainStatus.className = "inactive";
        }
    } catch (err) {
        console.error("Bridge Error:", err);
        mainStatus.innerText = "ERROR";
        mainStatus.className = "inactive";
    } finally {
        // Hide loader after a small delay
        setTimeout(() => {
            loader.classList.add('hidden');
        }, 500);
    }
}




// 5. Request HWID Reset Function (Synced with Railway API)
async function requestHWIDReset() {
    const hwidStatus = document.getElementById('hwid-status');
    const spooferStatus = document.getElementById('spoofer-status');
    const API_URL = "https://sk-auth-api.up.railway.app";

    if (hwidStatus) {
        hwidStatus.innerText = "BYPASSING BIOS RESTRICTIONS...";
        hwidStatus.className = "processing";
    }

    try {
        // 1. Run local C++ spoofing logic
        const results = await window.api.startSpoof();
        if (results) {

            if (hwidStatus) hwidStatus.innerText = "SYNCING WITH DATABASE...";

            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`, // Ensure token is stored here
                    'Content-Type': 'application/json'
                }
            });

            // 3. Give OS time to flush ID's
            await new Promise(resolve => setTimeout(resolve, 2000));

            if (hwidStatus) {
                hwidStatus.innerText = "HWID RESET COMPLETED";
                hwidStatus.className = "active-status";
            }

            if (spooferStatus) {
                spooferStatus.innerText = "ACTIVE";
                spooferStatus.className = "active-status";
            }

            // 4. Refresh IDs in UI
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
        terminal.innerHTML += `<span class="log-entry">> ${msg}</span><br>`;
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


// 5. AUTO-UPDATER UI LOGIC
window.api.onUpdateAvailable((data) => {
    document.getElementById('update-overlay').classList.remove('hidden');
    document.getElementById('update-version').innerText = `Update Found: v${data.version}`;

    if (data.news) {
        document.getElementById('update-status').innerText = data.news;
    }
});

const status = document.getElementById("user-status");
function setStatus(state) {
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


// 6. Injection
async function launchGame(gameName) {
    const res = await window.api.launchCheat(gameName);
    alert(res.message);
}
