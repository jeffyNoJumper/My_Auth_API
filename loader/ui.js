// 1. Boot Screen
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
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.getElementById(tabName + '-tab').classList.add('active');
}

// 2. Handle Login 
async function handleLogin() {
    const key = document.getElementById('license-key').value;
    const btn = document.getElementById('login-btn');
    
    btn.innerHTML = "FETCHING HWID...";

    try {
        // 1. Get the REAL Hardware ID from your C++ Backend
        // This 'window.api' is the bridge to your C++ code
        const realHWID = await window.api.getMachineIdentifier(); 

        btn.innerHTML = "VALIDATING...";

        // 2. Send the real data to your API
        const response = await fetch('https://sk-auth-api.up.railway.app', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                license_key: key, 
                hwid: realHWID 
            })
        });

        const data = await response.json();

        if (data.token) {
            // SUCCESS
            localStorage.setItem('auth_token', data.token); // Save session
            document.getElementById('user-pic').src = data.profile_pic;
            switchScreen('login-screen', 'main-dashboard');
        } else {
            alert(data.error);
            btn.innerHTML = "VALIDATE LICENSE";
        }
    } catch (err) {
        alert("Communication Error: " + err.message);
        btn.innerHTML = "VALIDATE LICENSE";
    }
}

