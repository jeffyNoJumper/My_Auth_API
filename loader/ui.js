// 1. Boot Screen Logic
window.onload = () => {
    let progress = 0;
    const bootScreen = document.getElementById('boot-screen');
    const bar = document.getElementById('boot-progress');
    const status = document.getElementById('boot-status');

    // Ensure boot screen starts visible and centered
    if (bootScreen) {
        bootScreen.style.display = 'flex';
        bootScreen.style.opacity = '1';
        bootScreen.style.zIndex = '10002'; // Sit on top of everything while loading
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
                    await fetch('https://sk-auth-api.up.railway.app', {
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
    if (tabName === 'hwid') refreshHWIDDisplay();
}

// New helper for the HWID tab
async function refreshHWIDDisplay() {
    try {
        const hwid = await window.api.getMachineIdentifier();
        // Assuming your HTML spans have these IDs
        if (document.getElementById('disk-id')) {
            document.getElementById('disk-id').innerText = hwid.substring(0, 15) + "...";
        }
    } catch (err) {
        console.error("Could not fetch HWID for display");
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
        const realHWID = await window.api.getMachineIdentifier();

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

// 4. Persistence Logic (Runs on Startup)
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
