async function handleLogin(isAutoLogin = false) {

    if (isAuthProcessActive && !isAutoLogin) return;

    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const rememberMe = document.getElementById('remember-me').checked;
    const btn = document.getElementById('login-btn');

    const savedEmail = localStorage.getItem('user_email');
    const savedPass = localStorage.getItem('remembered_password');
    const savedExpiry = localStorage.getItem('expiry_date');

    // ---------- AUTO LOGIN ----------
    if (!isAutoLogin && email === savedEmail && password === savedPass && savedExpiry) {

        const now = Date.now();
        const expTime = new Date(savedExpiry).getTime();

        if (now < expTime) {

            isAuthProcessActive = true;

            const modal = document.getElementById("auto-login-modal");
            if (modal) modal.style.display = "flex";

            const autoUser = document.getElementById("auto-login-user");
            if (autoUser) autoUser.innerText = email;

            setTimeout(async () => {
                isAuthProcessActive = false;
                await handleLogin(true);
            }, 3000);

            return;
        }
    }

    if (!email || !password) {
        alert("Enter Email and Password");
        return;
    }

    isAuthProcessActive = true;

    if (btn) {
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

            const modal = document.getElementById("auto-login-modal");
            if (modal) modal.style.display = "none";

            // ---------- SAVE SESSION ----------
            localStorage.setItem("user_email", email);
            localStorage.setItem("expiry_date", data.expiry);

            if (rememberMe) {
                localStorage.setItem("remembered_email", email);
                localStorage.setItem("remembered_password", password);
            }

            if (data.license_key) {
                localStorage.setItem("license_key", data.license_key.toUpperCase());
            }

            // ---------- PROFILE ----------
            const profilePic = data.profile_pic || "imgs/default-profile.png";
            localStorage.setItem("saved_profile_pic", profilePic);

            document.querySelectorAll("#user-pic").forEach(img => {
                img.src = profilePic;
            });

            // ---------- USER INFO ----------
            const nameDisplay = document.getElementById("user-display-name");
            const expiryDisplay = document.getElementById("user-expiry");
            const homeExpiry = document.getElementById("home-exp");

            if (nameDisplay) nameDisplay.innerText = email.split("@")[0];

            if (expiryDisplay)
                expiryDisplay.innerText = "EXP: " + new Date(data.expiry).toLocaleDateString();

            if (homeExpiry)
                homeExpiry.innerText = new Date(data.expiry).toLocaleDateString();

            // ---------- START EXPIRY HEARTBEAT ----------
            if (typeof startExpiryHeartbeat === "function")
                startExpiryHeartbeat(data.expiry);

            // ---------- SWITCH UI ----------
            const body = document.body;
            const login = document.getElementById("login-screen");
            const dash = document.getElementById("dashboard-wrapper");
            const sidebar = document.getElementById("sidebar");

            // switch CSS states
            if (body) {
                body.classList.remove("login-active");
                body.classList.add("logged-in");
            }

            if (login) login.style.display = "none";

            if (dash) dash.style.display = "flex";

            if (sidebar) {
                sidebar.style.display = "flex";
                sidebar.classList.remove("hidden");
            }

            // ---------- LOAD DEFAULT TAB ----------
            if (typeof showTab === "function") showTab("home");

        } else {

            const modal = document.getElementById("auto-login-modal");
            if (modal) modal.style.display = "none";

            alert("Login Failed: " + (data.error || "Invalid credentials"));

            isAuthProcessActive = false;

            if (btn) {
                btn.innerHTML = "LOGIN";
                btn.disabled = false;
            }
        }

    } catch (err) {

        console.error("AUTH ERROR:", err);

        alert("API Connection Error");

        isAuthProcessActive = false;

        if (btn) {
            btn.innerHTML = "LOGIN";
            btn.disabled = false;
        }
    }
}
