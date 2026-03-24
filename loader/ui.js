:root {
    --bg-dark: #121212;
    --sidebar-bg: #1e1e1e;
    --content-bg: #2a2a2a;
    --accent-teal: #1abc9c;
    --accent: #1abc9c;
    --accent-rgb: 26, 188, 156;
    --accent-glow: rgba(26, 188, 156, 0.35);
    --panel-start: rgba(29, 38, 48, 0.96);
    --panel-end: rgba(14, 19, 24, 0.94);
    --panel-border: rgba(255, 255, 255, 0.08);
    --panel-border-soft: rgba(255, 255, 255, 0.05);
    --panel-border-strong: rgba(26, 188, 156, 0.22);
    --panel-border-focus: rgba(26, 188, 156, 0.4);
    --panel-shadow: rgba(0, 0, 0, 0.22);
    --panel-shadow-strong: rgba(0, 0, 0, 0.34);
    --surface-muted: rgba(255, 255, 255, 0.04);
    --surface-muted-strong: rgba(255, 255, 255, 0.05);
    --surface-hover: rgba(26, 188, 156, 0.07);
    --surface-hover-strong: rgba(26, 188, 156, 0.14);
    --panel-text-strong: #d7fff6;
    --sidebar-tint: rgba(26, 188, 156, 0.08);
    --terminal-surface: rgba(0, 0, 0, 0.52);
    --text-main: #ffffff;
    --text-secondary: #b3b3b3;
    --online-green: #2ecc71;
    --gold: #f1c40f;
    --red: #ff5c5c;
    --exit-red: #e74c3c;
}

body {
    margin: 0;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background-color: transparent !important;
    color: var(--text-main);
    display: flex;
    height: 100vh;
    overflow: hidden;
    -webkit-app-region: drag;
    user-select: none;
}

body.login-active {
    display: block;
}

* {
    scrollbar-width: none;
    -ms-overflow-style: none;
}

*::-webkit-scrollbar {
    width: 0;
    height: 0;
    display: none;
    background: transparent;
}

.nav-item,
.action-btn,
button,
.dropdown-item,
.tab-content *,
.stat-tile,
.action-btn,
input,
.profile-trigger,
.sidebar-logo img,
.toast-notification {
    -webkit-app-region: no-drag !important;
    cursor: pointer !important;
}
.close-x {
    -webkit-app-region: no-drag;
    cursor: pointer;
    font-size: 22px;
}

.toast-stack {
    position: fixed;
    top: 16px;
    right: 75px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    z-index: 9999;
    pointer-events: none;
}

.toast-notification {
    width: min(320px, calc(100vw - 110px));
    background:
        radial-gradient(circle at top right, rgba(var(--accent-rgb), 0.18), transparent 34%),
        rgba(10, 10, 20, 0.92);
    color: #fff;
    padding: 14px 16px;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 18px 34px rgba(0, 0, 0, 0.34);
    font-size: 14px;
    cursor: pointer;
    transition: transform 0.2s ease, opacity 0.3s ease, border-color 0.2s ease;
    pointer-events: auto;
}

.toast-notification.is-admin {
    border-color: rgba(79, 172, 255, 0.32);
    background:
        radial-gradient(circle at top right, rgba(79, 172, 255, 0.22), transparent 36%),
        rgba(8, 12, 22, 0.94);
}

.toast-notification:hover {
    transform: translateY(-2px);
    opacity: 0.97;
}

.toast-title {
    display: block;
    margin-bottom: 6px;
    font-size: 0.88rem;
    font-weight: 800;
    letter-spacing: 0.3px;
}

.toast-message {
    margin: 0;
    color: rgba(255, 255, 255, 0.82);
    font-size: 0.74rem;
    line-height: 1.5;
    word-break: break-word;
}

.toast-meta {
    display: block;
    margin-top: 8px;
    color: rgba(255, 255, 255, 0.52);
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.9px;
    text-transform: uppercase;
}

.hidden {
    display: none !important;
}

/* Glass Modal Overlay */
.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.85); /* Deep dim */
    backdrop-filter: blur(10px); /* Modern frosted glass */
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10005; /* Stays above sidebar */
}

/* Settings Modal Content */
.modal-content {
    background: linear-gradient(145deg, #1e1e1e, #121212);
    border: 1px solid rgba(26, 188, 156, 0.3); /* Subtle teal border */
    border-radius: 16px;
    padding: 30px;
    width: 400px;
    box-shadow: 0 0 30px rgba(0, 0, 0, 0.5), 0 0 15px rgba(26, 188, 156, 0.1);
    text-align: center;
}

/* Close 'X' Button */
.close-x {
    float: right;
    font-size: 24px;
    color: #555;
    transition: 0.3s;
}

    .close-x:hover {
        color: var(--accent-teal);
        transform: rotate(90deg);
    }

/* Mini Button (Change Photo) */
.mini-btn {
    background: transparent;
    border: 1px solid var(--accent-teal);
    color: var(--accent-teal);
    padding: 6px 12px;
    font-size: 0.7rem;
    font-weight: bold;
    border-radius: 4px;
    cursor: pointer;
    transition: 0.3s;
}

    .mini-btn:hover {
        background: var(--accent-teal);
        color: #000;
    }

/* Full-screen Login Overlay — fully transparent, no bg or blur */
#login-screen {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: transparent !important;
    backdrop-filter: none !important;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10010;
    transition: opacity 0.5s ease, visibility 0.5s;
    -webkit-app-region: no-drag;
    pointer-events: none; /* clicks pass through except on card */
    border-radius: 16px;
}

body.login-active #login-screen {
    inset: 0;
    width: 100vw;
    height: 100vh;
    padding: 0;
    align-items: stretch;
    justify-content: stretch;
    pointer-events: auto;
    box-sizing: border-box;
    border-radius: 16px;
}

#login-screen .login-card {
    pointer-events: auto; /* card captures clicks */
}

/* The Login Card — fully opaque, nothing shows through */
.login-card {
    background: #030f2e !important;
    background-color: #030f2e !important;
    padding: 40px;
    border-radius: 12px;
    border: 1px solid var(--accent);
    width: 100%;
    max-width: 420px;
    box-shadow: 0 0 40px rgba(0, 0, 0, 0.9), 0 0 20px var(--accent-glow);
    display: flex;
    flex-direction: column;
    gap: 20px;
    position: relative;
    -webkit-app-region: no-drag;
    user-select: none;
    opacity: 1;
    isolation: isolate; /* blocks bleed-through from behind */
    box-sizing: border-box;
}

body.login-active #login-screen .login-card {
    width: 100%;
    max-width: none;
    min-height: 100%;
    height: 100%;
    padding: 28px 24px 22px;
    border-radius: 16px;
    box-sizing: border-box;
}

.login-form {
    display: flex;
    flex-direction: column;
    gap: 18px;
    width: 100%;
}

    .login-card input,
    .login-card button,
    .login-card a,
    .login-card .checkbox-container,
    .login-card label,
    .login-card .input-relative,
    .login-card .login-options,
    .login-card .remember-me,
    .login-card .remember-me span,
    .login-card .eye-icon {
        -webkit-app-region: no-drag;
        user-select: text; /* Allows text selection for copying keys */
        cursor: auto; /* Restores the 'I' cursor for typing */
    }

.card-header {
    -webkit-app-region: drag;
    cursor: move;
}

/* --- AUTH SPINNER --- */
.spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    margin-right: 8px; 
    vertical-align: middle;
    border: 2px solid rgba(0, 149, 255, 0.2); /* Faint track */
    border-top: 2px solid var(--accent); /* Glowing tip */
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    box-shadow: 0 0 5px var(--accent-glow);
}

@keyframes spin {
    0% {
        transform: rotate(0deg);
    }

    100% {
        transform: rotate(360deg);
    }
}

/* Ensure the button text stays aligned */
#login-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
}


/* Form Styling */
.input-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    text-align: left;
}

.input-relative {
    position: relative;
    display: flex;
    align-items: center;
}

    .input-group label {
        font-size: 0.75rem;
        color: var(--accent-teal);
        font-weight: bold;
        letter-spacing: 1px;
    }

    .input-group input {
        background: #121212;
        border: 1px solid #333;
        padding: 12px;
        color: white;
        border-radius: 4px;
        outline: none;
    }

        .input-group input:focus {
            border-color: var(--accent-teal);
        }

.input-relative input {
    width: 100%;
    box-sizing: border-box;
    padding-right: 72px;
}

.eye-icon {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    background: transparent;
    border: none;
    color: var(--accent-teal);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 1px;
    padding: 0;
    cursor: pointer !important;
}

.eye-icon:hover {
    color: #ffffff;
}

.login-options {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.remember-me {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--text-secondary);
    font-size: 0.75rem;
    cursor: pointer !important;
}

.remember-me input {
    margin: 0;
    accent-color: var(--accent-teal);
}

.login-link-btn {
    background: transparent;
    border: none;
    padding: 0;
    color: var(--accent-teal);
    font-size: 11px;
    font-weight: bold;
    letter-spacing: 0.8px;
    text-decoration: none;
    cursor: pointer !important;
}

.login-link-btn:hover {
    color: #ffffff;
    text-decoration: underline;
}

.login-warning {
    margin: 0;
    color: var(--red);
    font-size: 12px;
    line-height: 1.4;
}

.login-warning[data-state="info"] {
    color: var(--accent-teal);
}

/* Dashboard hidden until valid login — only show when body has .logged-in */
.sidebar,
.main-content {
    display: none !important;
    border-radius: 16px;
}
body.logged-in .sidebar {
    display: flex !important;
    flex-direction: column;
    border-radius: 16px;
}
body.logged-in .main-content {
    display: flex !important;
    border-radius: 16px;
    flex-direction: column;
}

/* AUTO LOGI MODAL */
.modal-overlay {
    position: fixed !important; /* Stay fixed to the screen */
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: transparent !important; /* Dim the background */
    backdrop-filter: blur(8px); /* Modern blur effect */

    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 99999;
    pointer-events: all;
}

    .modal-overlay.hidden {
        display: none !important;
    }

/* Modal Box Styling */
.modal-content.glass-card {
    /* Change #1a1a1a to transparent rgba */
    background: rgba(26, 26, 26, 0.6) !important;
    /* Keep your existing styles */
    border: 1px solid var(--accent-teal);
    padding: 30px;
    border-radius: 12px;
    /* Optional: Add a second blur here for extra "glass" effect */
    backdrop-filter: blur(12px);
    box-shadow: 0 0 40px rgba(0, 0, 0, 0.8), 0 0 15px rgba(26, 188, 156, 0.2);
    min-width: 350px;
    max-width: 400px;
}

.modal-icon {
    font-size: 3rem;
    color: #00f3ff; /* Neon Blue */
    margin-bottom: 15px;
    filter: drop-shadow(0 0 10px rgba(0, 243, 255, 0.5));
}

/* Status Badge */
.status-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-top: 5px;
}

    .status-badge p {
        margin: 0;
        font-size: 0.75rem;
        letter-spacing: 1.5px;
        color: #00f3ff;
        text-transform: uppercase;
    }

.pulse-dot {
    width: 6px;
    height: 6px;
    background: #00f3ff;
    border-radius: 50%;
    animation: pulse 1.5s infinite;
}

/* User Info Styling */
.auth-details {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: rgba(255, 255, 255, 0.7);
    font-family: 'Segoe UI', sans-serif;
    margin-top: 10px;
}

.cancel-btn i {
    margin-right: 5px;
    font-size: 0.8rem;
}

@keyframes pulse {
    0% {
        transform: scale(1);
        opacity: 1;
    }

    50% {
        transform: scale(1.5);
        opacity: 0.5;
    }

    100% {
        transform: scale(1);
        opacity: 1;
    }
}

/* Sidebar Styling */
.sidebar {
    width: 250px;
    background-color: var(--sidebar-bg);
    padding: 20px;
    display: flex;
    flex-direction: column;
    border-right: 1px solid #333;
}

.sidebar-logo img {
    max-width: 206px; /* Adjust size to fit sidebar */
    height: auto;
    display: block;
    margin: 0 auto;
    border-radius: 8px; /* optional rounded corners */
    box-shadow: 0 0 15px rgb(251, 0, 238); /* optional glow */
    transition: transform 0.3s ease;
}

    .sidebar-logo img:hover {
        transform: scale(1.05); /* subtle hover effect */
    }

.brand {
    color: var(--accent-teal);
    font-weight: bold;
    font-size: 1.2rem;
    margin-bottom: 30px;
}

.nav-group {
    flex-grow: 1;
    padding: 15px;
}

.nav-item {
    display: flex;
    align-items: center;
    padding: 12px 10px;
    color: var(--text-secondary);
    text-decoration: none;
    border-radius: 5px;
    transition: background 0.3s, color 0.3s;
    margin-bottom: 5px;
}

    .nav-item i {
        margin-right: 15px;
        width: 20px;
        text-align: center;
    }

.nav-item:hover, .nav-item.active {
        background-color: rgba(26, 188, 156, 0.1);
        color: var(--accent-teal);
    }

.nav-item.is-locked {
    opacity: 0.48;
    background: rgba(255, 84, 84, 0.04);
    color: #8d99a8;
}

.nav-item.is-locked:hover {
    background: rgba(255, 84, 84, 0.08);
    color: #c3ccd6;
}

.footer-nav {
    margin-top: auto;
    border-top: 1px solid #333;
    padding-top: 20px;
}

.exit-btn {
    color: var(--exit-red);
}

/* TAB LOGIC */
.tab-content {
    display: none;
    width: 100%;
}

#home-tab {
    display: block;
    width: 100%;
}

.home-tab-shell {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
    box-sizing: border-box;
}

.home-hero {
    width: 100%;
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 20px;
    border-radius: 18px;
    background:
        radial-gradient(circle at top right, rgba(var(--accent-rgb), 0.18), transparent 38%),
        linear-gradient(135deg, var(--panel-start), var(--panel-end));
    border: 1px solid var(--panel-border);
    box-shadow: 0 18px 34px var(--panel-shadow);
    align-items: flex-start;
    box-sizing: border-box;
}

.home-hero-copy {
    flex: 1 1 auto;
    min-width: 0;
}

.home-hero-copy h2 {
    margin: 8px 0 10px;
}

.home-hero-badge {
    min-width: 118px;
    padding: 12px 14px;
    border-radius: 16px;
    background: var(--surface-muted-strong);
    border: 1px solid var(--panel-border-strong);
    text-align: right;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
    box-sizing: border-box;
}

.home-hero-badge span,
.home-stat-card span,
.home-meta-row span,
.home-action-kicker {
    display: block;
    font-size: 0.72rem;
    letter-spacing: 1.3px;
    text-transform: uppercase;
    color: var(--text-secondary);
}

.home-hero-badge strong {
    display: block;
    margin-top: 6px;
    font-size: 1.15rem;
    color: var(--panel-text-strong);
}

.home-overview-grid,
.home-panels-grid {
    width: 100%;
    display: grid;
    gap: 14px;
    box-sizing: border-box;
}

.home-overview-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin-top: 0;
}

.home-panels-grid {
    grid-template-columns: 1.15fr 0.95fr;
    margin-top: 0;
}

.home-stat-card,
.home-panel-card {
    background: linear-gradient(180deg, var(--panel-start), var(--panel-end));
    border: 1px solid var(--panel-border);
    border-radius: 16px;
    box-shadow: 0 16px 32px var(--panel-shadow);
    box-sizing: border-box;
}

.home-stat-card {
    padding: 16px 16px 14px;
    min-height: 116px;
}

.home-stat-card strong {
    display: block;
    margin-top: 10px;
    font-size: 1.38rem;
    letter-spacing: 0.4px;
    color: var(--panel-text-strong);
}

.home-stat-card small {
    display: block;
    margin-top: 10px;
    font-size: 0.78rem;
    color: var(--text-secondary);
    line-height: 1.5;
}

.home-status-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
}

.home-status-pill::before {
    content: "";
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 10px currentColor;
}

.home-status-pill.online {
    color: #37d67a;
}

.home-status-pill.offline {
    color: #ff6464;
}

.home-status-pill.checking {
    color: #f1c40f;
}

.home-panel-card {
    padding: 16px;
}

.home-meta-grid,
.home-action-grid {
    display: grid;
    gap: 12px;
    width: 100%;
    box-sizing: border-box;
}

.home-meta-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--surface-muted);
    border: 1px solid var(--panel-border-soft);
    align-items: center;
    box-sizing: border-box;
}

.home-meta-row strong {
    text-align: right;
    color: var(--panel-text-strong);
    font-size: 0.9rem;
}

.home-action-btn {
    width: 100%;
    min-height: 82px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 6px;
    padding: 16px;
    text-align: left;
    background: var(--surface-hover);
    border: 1px solid var(--panel-border-strong);
    border-radius: 14px;
    color: var(--panel-text-strong);
    box-shadow: none;
    box-sizing: border-box;
}

.home-action-btn strong {
    font-size: 1rem;
}

.home-action-btn small {
    color: var(--text-secondary);
    line-height: 1.45;
}

.home-action-btn:hover {
    background: var(--surface-hover-strong);
    border-color: var(--panel-border-focus);
    transform: translateY(-1px);
}

.injection-progress-card {
    width: min(420px, 92vw);
    padding: 28px;
    border-radius: 16px;
    background:
        radial-gradient(circle at top right, rgba(var(--accent-rgb), 0.18), transparent 35%),
        linear-gradient(180deg, var(--panel-start), var(--panel-end));
    border: 1px solid var(--panel-border-strong);
    text-align: center;
    box-shadow: 0 20px 38px var(--panel-shadow-strong);
}

.injection-progress-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 14px;
    margin-bottom: 16px;
}

.injection-progress-label {
    font-size: 11px;
    color: var(--accent);
    letter-spacing: 1.5px;
    font-weight: 700;
    text-transform: uppercase;
}

.injection-progress-percent {
    font-size: 12px;
    color: #fff;
    font-weight: 700;
}

.injection-progress-track {
    width: 100%;
    height: 10px;
    background: rgba(0, 0, 0, 0.82);
    border-radius: 999px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.02);
}

.injection-progress-bar {
    width: 0%;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, rgba(26, 188, 156, 0.82), #8cffde);
    box-shadow: 0 0 18px rgba(26, 188, 156, 0.34);
    transition: width 0.35s ease, background 0.25s ease, box-shadow 0.25s ease;
}

.injection-progress-bar.is-success {
    background: linear-gradient(90deg, #2ecc71, #9dffca);
    box-shadow: 0 0 18px rgba(46, 204, 113, 0.34);
}

.injection-progress-bar.is-error {
    background: linear-gradient(90deg, #ff4f6a, #ff9a9a);
    box-shadow: 0 0 18px rgba(255, 79, 106, 0.34);
}

.injection-progress-copy {
    font-size: 10px;
    color: #77808d;
    margin-top: 18px;
    text-transform: uppercase;
    letter-spacing: 1px;
}


.dashboard-card {
    background: linear-gradient(180deg, var(--panel-start), var(--panel-end));
    border-radius: 12px;
    padding: 30px;
    width: 95%;
    max-width: 1000px;
    margin: 0 auto;
    border: 1px solid var(--panel-border);
    box-shadow: 0 10px 30px var(--panel-shadow-strong);
    min-height: 500px;
    display: flex;
    flex-direction: column;
    align-items: center;
    box-sizing: border-box;
}

/* buttons */
.btn-primary {
    padding: 10px 20px;
    border-radius: 8px;
    border: none;
    background: #00f2ff;
    color: black;
    font-weight: bold;
    cursor: pointer;
    box-shadow: 0 0 10px #00f2ff;
}

.btn-secondary {
    padding: 10px 20px;
    border-radius: 8px;
    border: 1px solid #444;
    background: transparent;
    color: white;
    cursor: pointer;
}

#update-version {
    word-break: break-all;
}

/* HWID & SPOOFER GRID STYLING */
.hwid-grid, .spoof-grid {
    width: 100%;
    box-sizing: border-box;
}

.hwid-card, .admin-card, .spoof-card {
    background: rgba(0,0,0,0.2);
    padding: 15px;
    border-radius: 8px;
    border: 1px solid #333;
}

.accent-text {
    color: var(--accent-teal);
    text-transform: uppercase;
    letter-spacing: 1px;
}

.hwid-terminal-box {
    background: #000;
    padding: 15px;
    border-radius: 5px;
    font-family: 'Courier New', Courier, monospace;
    font-size: 0.75rem;
    margin: 15px 0;
    border: 1px solid #222;
    text-align: left;
    margin-bottom: 10px;
    word-break: break-all;
    overflow-wrap: break-word;
    white-space: normal;
}

.code-text {
    color: var(--accent-teal);
    display: inline-block;
    width: 100%;
}

.reset-btn {
    width: 100%;
    padding: 12px;
    background: transparent;
    border: 1px solid var(--accent-teal);
    color: var(--accent-teal);
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1px;
    cursor: pointer;
    border-radius: 4px;
    transition: 0.3s;
}

    .reset-btn:hover {
        background: var(--accent-teal);
        color: #000;
        box-shadow: 0 0 15px rgba(26, 188, 156, 0.4);
    }

/* Main Content Styling */
.main-content {
    flex-grow: 1;
    padding: 15px;
    background-color: var(--bg-dark);
    display: flex;
    flex-direction: column;
    height: auto;
    min-width: 0;
    overflow-x: hidden;
}

/* ADMIN TERMINAL SPECIFIC STYLING */
.admin-card {
    border-color: #f1c40f44 !important;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    margin-top: 5px;
}

.gold-text {
    color: #f1c40f !important;
    text-shadow: 0 0 10px rgba(241, 196, 15, 0.3);
}

.admin-terminal-box {
    background: #000;
    padding: 15px;
    border-radius: 5px;
    font-family: 'Courier New', Courier, monospace;
    font-size: 0.85rem;
    height: 120px;
    overflow-y: auto;
    margin: 15px 0;
    border: 1px solid #222;
    box-shadow: inset 0 0 10px rgba(0,0,0,0.8);
}

.log-entry {
    display: block;
    color: #f1c40f; /* Gold text for admin logs */
    margin-bottom: 5px;
    opacity: 0.9;
}

/* ADMIN REQUEST BUTTON */
.admin-req-btn {
    width: 100%;
    padding: 12px;
    background: transparent;
    border: 1px solid #f1c40f;
    color: #f1c40f;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1px;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.3s ease;
}

    .admin-req-btn:hover {
        background: #f1c40f;
        color: #000;
        box-shadow: 0 0 15px rgba(241, 196, 15, 0.4);
    }

/* Status Line at Bottom */
.hwid-status-line {
    margin-top: 20px;
    font-size: 0.8rem;
    color: var(--text-secondary);
    font-style: italic;
}

/* Scrollbar for Terminal */
.admin-terminal-box::-webkit-scrollbar {
    width: 4px;
}

.admin-terminal-box::-webkit-scrollbar-thumb {
    background: #444;
    border-radius: 2px;
}


.header {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    margin-bottom: 20px;
}

/* Updated User Profile Layout */
.user-profile {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 15px;
    cursor: pointer;
}

.user-info {
    text-align: right;
}

    .user-info .name {
        font-weight: bold;
        font-size: 1.1rem;
        color: var(--text-main);
        display: block;
    }

    /* Status/Expiry Text */
    .user-info .status {
        font-size: 0.8rem;
        color: var(--text-secondary);
        display: block;
    }

#user-pic {
    width: 45px;
    height: 45px;
    border-radius: 50%;
    border: 2px solid #333;
    transition: all 0.3s ease;
    object-fit: cover;
}

    #user-pic.glow-border:hover {
        border-color: var(--accent-teal);
        box-shadow: 0 0 10px rgba(26, 188, 156, 0.4);
    }

/* Status Dot Positioning */
.profile-wrapper {
    position: relative;
    display: flex;
}

.status-dot {
    position: absolute;
    bottom: 2px;
    right: 2px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 2px solid var(--bg-dark); /* Creates a "cutout" look */
}

.dot-online {
    background-color: var(--online-green);
}

/* Dashboard Card */
.dashboard-card {
    background: linear-gradient(180deg, var(--panel-start), var(--panel-end));
    border-radius: 12px;
    padding: 18px 20px 20px;
    width: 100%;
    max-width: none;
    flex: 1 1 auto;
    min-height: 0;
    min-width: 0;
    margin: 0;
    border: 1px solid var(--panel-border);
    box-shadow: 0 10px 30px var(--panel-shadow-strong);
    display: flex;
    flex-direction: column;
    align-items: stretch;
    box-sizing: border-box;
    overflow-y: auto;
    overflow-x: hidden;
}

    .dashboard-card h2 {
        margin-bottom: 5px;
    }

    .dashboard-card p.subtitle {
        color: var(--text-secondary);
        margin-bottom: 40px;
    }

.info-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 30px;
    text-align: left;
}

.info-item {
    display: flex;
    align-items: center;
}

.info-icon {
    font-size: 2rem;
    margin-right: 20px;
    color: var(--text-secondary);
}

.info-label {
    font-weight: bold;
}

.info-value {
    color: var(--text-secondary);
    font-size: 0.9rem;
}

.status-online {
    color: var(--online-green);
    font-weight: bold;
}

/* TAB SHELLS */
.tab-shell {
    width: 100%;
}

.tab-shell-header {
    width: 100%;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 16px;
}

.tab-shell-subtitle {
    margin: 6px 0 0;
    color: var(--text-secondary);
    font-size: 0.8rem;
    line-height: 1.5;
}

.tab-shell-badge {
    padding: 8px 11px;
    border-radius: 999px;
    border: 1px solid var(--panel-border-strong);
    background: var(--surface-hover);
    color: var(--panel-text-strong);
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 1.2px;
    white-space: nowrap;
}

.tab-stat-card {
    padding: 12px;
    border-radius: 12px;
    background: var(--surface-muted);
    border: 1px solid var(--panel-border);
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.tab-stat-card span {
    color: var(--text-secondary);
    font-size: 0.66rem;
    letter-spacing: 1px;
    text-transform: uppercase;
}

.tab-stat-card strong {
    color: var(--text-main);
    font-size: 0.84rem;
    line-height: 1.35;
}

.tab-stat-card strong.active-status,
.tab-stat-card strong.status-active {
    color: #4CAF50;
}

.tab-stat-card strong.inactive,
.tab-stat-card strong.status-inactive {
    color: #ff6464;
}

.tab-stat-card strong.processing {
    color: #f1c40f;
}

.tab-panel {
    border-radius: 14px;
    padding: 16px;
    background: linear-gradient(180deg, var(--panel-start), var(--panel-end));
    border: 1px solid var(--panel-border);
    box-shadow: 0 16px 34px var(--panel-shadow);
}

.tab-panel-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
}

.tab-panel-head h3 {
    margin: 0;
}

.hwid-request-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 72px;
    padding: 7px 12px;
    border-radius: 999px;
    border: 1px solid rgba(52, 211, 153, 0.28);
    background: rgba(16, 185, 129, 0.12);
    color: #c6ffe4;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    white-space: nowrap;
}

.hwid-request-badge.is-empty {
    border-color: rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
    color: var(--text-secondary);
}

.panel-kicker {
    display: inline-flex;
    align-items: center;
    width: fit-content;
    max-width: 100%;
    padding: 6px 10px;
    margin-bottom: 4px;
    color: var(--text-secondary);
    font-size: 0.63rem;
    letter-spacing: 1.3px;
    text-transform: uppercase;
    line-height: 1;
    border-radius: 999px;
    background: var(--surface-muted);
    border: 1px solid var(--panel-border-strong);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

@media (max-width: 960px) {
    .home-hero {
        flex-direction: column;
    }

    .home-hero-badge {
        width: 100%;
        text-align: left;
    }

    .home-overview-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .home-panels-grid {
        grid-template-columns: 1fr;
    }

    .game-launch-choice-grid {
        grid-template-columns: 1fr;
    }
}

.panel-subcopy,
.panel-footnote {
    color: var(--text-secondary);
    font-size: 0.72rem;
    line-height: 1.5;
}

.panel-footnote {
    margin: 12px 0 14px;
}

/* GAME TAB */
.steam-grid,
.games-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
    width: 100%;
}

.game-card {
    position: relative;
    width: 100%;
    padding: 0;
    background: linear-gradient(180deg, rgba(26, 26, 30, 0.98), rgba(13, 13, 16, 0.96));
    border-radius: 14px;
    overflow: hidden;
    cursor: pointer;
    border: 1px solid rgba(255, 255, 255, 0.08);
    transition: transform 0.24s ease, border-color 0.24s ease, box-shadow 0.24s ease;
    text-align: left;
    font: inherit;
    appearance: none;
    box-shadow: 0 18px 34px rgba(0, 0, 0, 0.22);
}

.game-card:hover {
    transform: translateY(-3px);
}

.game-card.locked {
    filter: saturate(0.86);
}

.card-green:hover {
    border-color: rgba(46, 204, 113, 0.7);
    box-shadow: 0 14px 30px rgba(46, 204, 113, 0.18);
}

.card-gold:hover {
    border-color: rgba(241, 196, 15, 0.72);
    box-shadow: 0 14px 30px rgba(241, 196, 15, 0.18);
}

.card-blue:hover {
    border-color: rgba(52, 152, 219, 0.72);
    box-shadow: 0 14px 30px rgba(52, 152, 219, 0.18);
}

.card-red:hover {
    border-color: rgba(231, 76, 60, 0.72);
    box-shadow: 0 14px 30px rgba(231, 76, 60, 0.18);
}

.game-card-topline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 12px 0;
    gap: 10px;
}

.game-card-chip {
    padding: 4px 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.07);
    color: var(--text-secondary);
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 1.2px;
}

.game-card-tone {
    color: rgba(255, 255, 255, 0.78);
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.4px;
}

.game-card-media {
    position: relative;
    height: 170px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px 12px 0;
}

.card-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    background-color: transparent;
}

.game-card-footer {
    padding: 10px 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.game-card-heading-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
}

.game-card-footer strong {
    color: var(--text-main);
    font-size: 0.92rem;
    line-height: 1.2;
}

.game-card-footer span {
    color: var(--text-secondary);
    font-size: 0.72rem;
    line-height: 1.45;
}

.game-card-state {
    padding: 5px 9px;
    border-radius: 999px;
    border: 1px solid rgba(255, 92, 92, 0.24);
    background: rgba(255, 92, 92, 0.12);
    color: #ffc0c0;
    font-size: 0.55rem;
    font-weight: 800;
    letter-spacing: 1.1px;
    text-transform: uppercase;
    white-space: nowrap;
}

.game-card[data-access="ready"] .game-card-state {
    border-color: rgba(46, 204, 113, 0.28);
    background: rgba(46, 204, 113, 0.14);
    color: #cbffd8;
}

.game-card[data-access="partial"] .game-card-state,
.game-card[data-access="pending"] .game-card-state {
    border-color: rgba(241, 196, 15, 0.26);
    background: rgba(241, 196, 15, 0.13);
    color: #ffe8a4;
}

.game-card-modules {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 7px;
}

.game-card-module-pill {
    padding: 5px 10px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.82);
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.9px;
}

.game-card-module-pill.is-ready {
    border-color: rgba(26, 188, 156, 0.28);
    background: rgba(26, 188, 156, 0.14);
    color: #d7fff6;
}

.game-card-module-pill.is-missing {
    opacity: 0.62;
}

.card-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.22), rgba(0, 0, 0, 0.78));
    display: flex;
    align-items: flex-end;
    justify-content: stretch;
    padding: 14px;
    opacity: 0;
    transition: opacity 0.24s ease;
    pointer-events: none;
}

.game-card:hover .card-overlay {
    opacity: 1;
}

.game-hover-panel {
    width: 100%;
    padding: 14px;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background:
        radial-gradient(circle at top right, rgba(var(--accent-rgb), 0.16), transparent 34%),
        rgba(8, 10, 14, 0.84);
    backdrop-filter: blur(10px);
    box-shadow: 0 18px 34px rgba(0, 0, 0, 0.22);
    transform: translateY(8px);
    transition: transform 0.24s ease;
}

.game-card:hover .game-hover-panel {
    transform: translateY(0);
}

.game-hover-kicker {
    display: inline-block;
    margin-bottom: 8px;
    color: var(--accent);
    font-size: 0.58rem;
    font-weight: 800;
    letter-spacing: 1.4px;
}

.game-hover-panel strong {
    display: block;
    margin-bottom: 6px;
    color: #fff;
    font-size: 0.88rem;
    letter-spacing: 0.3px;
}

.game-hover-panel p {
    margin: 0;
    color: rgba(255, 255, 255, 0.74);
    font-size: 0.68rem;
    line-height: 1.55;
}

.game-hover-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
}

.game-hover-meta span {
    padding: 5px 9px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.86);
    font-size: 0.56rem;
    font-weight: 700;
    letter-spacing: 0.85px;
    text-transform: uppercase;
}

.game-launch-modal-card {
    width: min(520px, 92vw);
    padding: 24px;
    border-radius: 18px;
    text-align: left;
}

.game-launch-hero {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
}

.game-launch-kicker {
    display: inline-block;
    color: var(--accent);
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 1.6px;
    margin-bottom: 6px;
}

.game-launch-title {
    margin: 0;
    color: #fff;
    font-size: 1.24rem;
    letter-spacing: 0.4px;
}

.game-launch-status {
    padding: 7px 11px;
    border-radius: 999px;
    border: 1px solid rgba(26, 188, 156, 0.22);
    background: rgba(26, 188, 156, 0.12);
    color: var(--panel-text-strong);
    font-size: 0.58rem;
    font-weight: 800;
    letter-spacing: 1.1px;
    text-transform: uppercase;
    white-space: nowrap;
}

.game-launch-status.is-pending {
    border-color: rgba(241, 196, 15, 0.24);
    background: rgba(241, 196, 15, 0.12);
    color: #ffe8a4;
}

.game-launch-copy {
    margin: 16px 0 6px;
    color: rgba(255, 255, 255, 0.82);
    font-size: 0.84rem;
    line-height: 1.6;
}

.game-launch-update {
    margin: 0;
    color: rgba(255, 255, 255, 0.58);
    font-size: 0.7rem;
    line-height: 1.55;
}

.game-launch-choice-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin-top: 18px;
}

.game-launch-choice {
    appearance: none;
    width: 100%;
    padding: 16px;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background:
        radial-gradient(circle at top right, rgba(var(--accent-rgb), 0.16), transparent 36%),
        rgba(8, 11, 16, 0.86);
    color: #fff;
    display: flex;
    flex-direction: column;
    gap: 8px;
    text-align: left;
    transition: transform 0.22s ease, border-color 0.22s ease, box-shadow 0.22s ease, opacity 0.22s ease;
    cursor: pointer;
}

.game-launch-choice:hover:not(:disabled) {
    transform: translateY(-2px);
    border-color: rgba(26, 188, 156, 0.32);
    box-shadow: 0 16px 28px rgba(0, 0, 0, 0.22);
}

.game-launch-choice:disabled,
.game-launch-choice.is-unavailable {
    opacity: 0.46;
    cursor: not-allowed;
    box-shadow: none;
}

.game-launch-choice-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 12px;
    background: rgba(var(--accent-rgb), 0.16);
    border: 1px solid rgba(var(--accent-rgb), 0.22);
    color: var(--panel-text-strong);
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 1px;
}

.game-launch-choice-title {
    font-size: 0.98rem;
    font-weight: 800;
    letter-spacing: 0.4px;
}

.game-launch-choice-note {
    color: rgba(255, 255, 255, 0.78);
    font-size: 0.72rem;
    line-height: 1.5;
}

.game-launch-choice-foot {
    color: rgba(255, 255, 255, 0.5);
    font-size: 0.64rem;
    text-transform: uppercase;
    letter-spacing: 0.9px;
}

.game-launch-cancel {
    width: 100%;
    margin-top: 16px;
    padding: 12px 16px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.8);
    font-weight: 700;
    letter-spacing: 0.8px;
    cursor: pointer;
    transition: border-color 0.22s ease, background 0.22s ease, color 0.22s ease;
}

.game-launch-cancel:hover {
    border-color: rgba(var(--accent-rgb), 0.24);
    background: rgba(var(--accent-rgb), 0.08);
    color: #fff;
}

/* HWID TAB */
.hwid-summary-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    width: 100%;
    margin-bottom: 14px;
}

.hwid-grid,
.hwid-grid-modern {
    display: grid;
    grid-template-columns: 1fr;
    gap: 14px;
    width: 100%;
}

.hwid-card,
.admin-card,
.spoof-card {
    background: linear-gradient(180deg, rgba(20, 22, 28, 0.96), rgba(12, 14, 18, 0.94));
    padding: 16px;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 16px 34px rgba(0, 0, 0, 0.22);
}

.hwid-terminal-box {
    background: linear-gradient(180deg, rgba(4, 6, 8, 0.98), rgba(0, 0, 0, 0.96));
    padding: 15px;
    border-radius: 12px;
    font-family: 'Courier New', Courier, monospace;
    font-size: 0.75rem;
    margin: 0;
    border: 1px solid rgba(26, 188, 156, 0.18);
    text-align: left;
    word-break: break-all;
    overflow-wrap: break-word;
    white-space: normal;
    box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.4);
}

.hwid-terminal-box p {
    margin: 0 0 10px;
}

.hwid-terminal-box p:last-child {
    margin-bottom: 0;
}

.code-text {
    color: var(--accent-teal);
    display: inline-block;
    width: 100%;
    margin-top: 4px;
}

.reset-btn,
.admin-req-btn {
    width: 100%;
    min-height: 44px;
    padding: 12px;
    background: rgba(26, 188, 156, 0.08);
    border: 1px solid rgba(26, 188, 156, 0.35);
    color: #c9fff4;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    cursor: pointer;
    border-radius: 10px;
    transition: background 0.24s ease, box-shadow 0.24s ease, transform 0.24s ease;
}

.reset-btn:hover,
.admin-req-btn:hover {
    background: rgba(26, 188, 156, 0.16);
    box-shadow: 0 0 16px rgba(26, 188, 156, 0.14);
    transform: translateY(-1px);
}

.reset-btn:disabled,
.admin-req-btn:disabled {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.08);
    color: var(--text-secondary);
    box-shadow: none;
    transform: none;
    cursor: not-allowed !important;
    opacity: 0.72;
}

.admin-card {
    border-color: rgba(241, 196, 15, 0.14);
}

.gold-text {
    color: #f1c40f !important;
    text-shadow: 0 0 10px rgba(241, 196, 15, 0.22);
}

.admin-terminal-box {
    background: linear-gradient(180deg, rgba(7, 7, 7, 0.98), rgba(0, 0, 0, 0.96));
    padding: 14px;
    border-radius: 12px;
    font-family: 'Courier New', Courier, monospace;
    font-size: 0.8rem;
    height: 150px;
    overflow-y: auto;
    margin: 0 0 14px;
    border: 1px solid rgba(241, 196, 15, 0.14);
    box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.45);
}

.log-entry {
    display: block;
    color: #f1c40f;
    margin-bottom: 7px;
    opacity: 0.92;
}

.hwid-status-line {
    margin-top: 14px;
    font-size: 0.8rem;
    color: var(--text-secondary);
    font-style: italic;
    align-self: flex-start;
}

.admin-terminal-box::-webkit-scrollbar {
    width: 4px;
}

.admin-terminal-box::-webkit-scrollbar-thumb {
    background: #444;
    border-radius: 2px;
}

/* SPOOF TAB */
.spoofer-panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: 100%;
    text-align: left;
}

.accent-text {
    color: var(--accent-teal);
    text-transform: uppercase;
    letter-spacing: 1.5px;
    text-shadow: 0 0 10px var(--accent-glow);
}

.spoof-hero-panel {
    padding: 16px;
    border-radius: 14px;
    background: linear-gradient(180deg, var(--panel-start), var(--panel-end));
    border: 1px solid var(--panel-border);
    box-shadow: 0 16px 34px var(--panel-shadow);
}

.spoof-header-row {
    display: flex;
    align-items: center;
    gap: 16px;
    justify-content: space-between;
}

.shield-icon {
    width: 52px;
    height: 52px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 14px;
    background: var(--surface-hover);
    border: 1px solid var(--panel-border-strong);
}

.shield-img {
    width: 30px;
    filter: drop-shadow(0 0 8px var(--accent-glow));
}

.status-text-group {
    flex: 1;
    min-width: 0;
}

.status-text-group h2 {
    margin: 0;
}

.status-text-group p {
    margin: 6px 0 0;
    color: var(--text-secondary);
    font-size: 0.78rem;
    line-height: 1.5;
}

.spoof-progress-shell {
    min-width: 36px;
    display: flex;
    justify-content: flex-end;
}

.status-inactive {
    color: #ff6464;
    font-weight: 700;
    letter-spacing: 1px;
}

.status-active,
.status-perm {
    color: #4CAF50;
}

.active-status {
    color: #4CAF50;
}

.status-temp {
    color: #f1c40f;
}

.processing {
    color: #f1c40f;
}

.inactive {
    color: #ff6464;
}

.spoof-mode-container {
    display: inline-flex;
    background: var(--terminal-surface);
    border-radius: 12px;
    padding: 4px;
    border: 1px solid var(--panel-border);
    width: fit-content;
    margin-top: 14px;
}

.mode-btn {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    padding: 9px 14px;
    font-size: 0.78rem;
    cursor: pointer;
    transition: all 0.24s ease;
    border-radius: 8px;
    white-space: nowrap;
}

.mode-btn:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.05);
}

.mode-btn.active {
    background: var(--accent);
    color: #000;
    font-weight: 700;
}

.spoof-grid,
.spoof-grid-modern {
    display: grid;
    grid-template-columns: 1fr;
    gap: 14px;
    width: 100%;
}

.spoof-card {
    position: relative;
    overflow: hidden;
}

.spoof-card::after {
    content: "";
    position: absolute;
    inset: 0;
    background-image: radial-gradient(rgba(26, 188, 156, 0.03) 1px, transparent 1px);
    background-size: 18px 18px;
    pointer-events: none;
}

.spoof-card > * {
    position: relative;
    z-index: 1;
}

.spoof-action-card {
    border-color: rgba(26, 188, 156, 0.14);
}

.card-label {
    color: var(--text-secondary);
    font-size: 0.66rem;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    margin-bottom: 8px;
}

.motherboard-select-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
}

.mb-icon {
    width: 36px;
    height: 36px;
    object-fit: contain;
    opacity: 0.95;
    flex: none;
}

.styled-select {
    flex: 1;
    min-height: 38px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.12);
    padding: 8px 10px;
    border-radius: 10px;
    outline: none;
}

.toggle-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.toggle-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 12px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
}

.toggle-row input[type="checkbox"] {
    margin-top: 3px;
    flex: none;
}

.toggle-copy {
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.toggle-title {
    color: var(--text-main);
    font-size: 0.84rem;
    font-weight: 700;
}

.toggle-meta {
    color: var(--text-secondary);
    font-size: 0.72rem;
    line-height: 1.45;
    margin-top: 3px;
}

.deep-clean-row {
    flex-direction: column;
}

.deepclean-warning {
    width: 100%;
    margin-top: 10px;
    padding: 10px 12px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    line-height: 1.4;
    border: 1px solid rgba(255, 60, 60, 0.35);
    background: rgba(255, 60, 60, 0.06);
    color: #ff6b6b;
}

.deepclean-warning i {
    font-size: 14px;
    color: #ff4444;
}

.recommended-tag {
    display: inline-flex;
    margin-bottom: 10px;
    padding: 5px 8px;
    border-radius: 999px;
    background: rgba(26, 188, 156, 0.1);
    border: 1px solid rgba(26, 188, 156, 0.18);
    color: #bdfef0;
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 1.2px;
}

.warning-box,
.bios-warning-box {
    margin-top: 14px;
    padding: 12px;
    border-radius: 12px;
    border: 1px solid rgba(255, 80, 80, 0.3);
    background: rgba(40, 0, 0, 0.28);
    font-size: 12px;
    line-height: 1.5;
}

.warning-box p,
.bios-warning-box p {
    margin: 4px 0;
}

.action-btn.spoof-btn {
    width: 100%;
    min-height: 46px;
    margin-top: 14px;
    border-radius: 10px;
    border: 1px solid rgba(26, 188, 156, 0.28);
    background: rgba(26, 188, 156, 0.12);
    color: #d7fff5;
    font-weight: 700;
    letter-spacing: 1px;
}

.action-btn.spoof-btn:hover {
    background: rgba(26, 188, 156, 0.18);
    box-shadow: 0 0 18px rgba(26, 188, 156, 0.14);
}

.success-icon {
    color: #4CAF50;
    font-size: 28px;
    animation: popIn 0.4s ease;
}

@keyframes popIn {
    0% {
        transform: scale(0.5);
        opacity: 0;
    }

    100% {
        transform: scale(1);
        opacity: 1;
    }
}

.deepclean-modal {
    width: 420px;
}

.game-clean-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 15px;
}

.game-clean-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px;
    border-radius: 10px;
    cursor: pointer;
    transition: background 0.2s ease;
}

.game-clean-item:hover {
    background: rgba(255,255,255,0.05);
}

.game-icon {
    width: 28px;
    height: 28px;
    object-fit: contain;
}

.game-icon img {
    width: 100%;
    height: 100%;
    object-fit: contain;
}

.game-clean-item span {
    flex: 1;
    font-size: 14px;
}

.modal-actions {
    display: flex;
    gap: 10px;
    margin-top: 20px;
    justify-content: flex-end;
}

.exit-modal-card {
    max-width: 420px;
}

.exit-modal-copy {
    margin-top: 12px;
    color: var(--text-secondary);
    font-size: 0.88rem;
    line-height: 1.55;
}

.exit-choice-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin-top: 24px;
}

.exit-choice-grid .btn-primary,
.exit-choice-grid .btn-secondary {
    width: 100%;
    min-height: 44px;
}

.exit-modal-actions {
    justify-content: center;
}

.external-link-modal-card,
.app-dialog-card {
    max-width: 440px;
}

.external-link-kicker,
.app-dialog-kicker {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 14px;
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    color: #9ffcff;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 1.1px;
    text-transform: uppercase;
}

.external-link-copy,
.app-dialog-copy {
    margin-top: 12px;
    color: var(--text-secondary);
    font-size: 0.88rem;
    line-height: 1.55;
    word-break: break-word;
}

.external-link-url,
.app-dialog-detail {
    margin-top: 14px;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(0, 0, 0, 0.38);
    color: #d9feff;
    font-family: Consolas, Monaco, monospace;
    font-size: 0.72rem;
    line-height: 1.5;
    word-break: break-word;
}

.discord-md-underline {
    text-decoration: underline;
    text-decoration-thickness: 1.5px;
    text-underline-offset: 2px;
}

.discord-md-code {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #dffaff;
    font-size: 0.92em;
    font-family: "Consolas", "Cascadia Mono", monospace;
}

.external-link-note {
    margin-top: 14px;
    color: var(--text-secondary);
    font-size: 0.76rem;
    line-height: 1.5;
}

.external-link-actions,
.app-dialog-actions {
    justify-content: center;
    flex-wrap: wrap;
}

.external-link-actions .btn-primary,
.external-link-actions .btn-secondary,
.app-dialog-actions .btn-primary,
.app-dialog-actions .btn-secondary,
.app-dialog-actions .btn-danger {
    min-width: 120px;
}

.app-dialog-card[data-tone="error"] {
    border-color: rgba(255, 92, 92, 0.4);
    box-shadow: 0 0 30px rgba(255, 92, 92, 0.12);
}

.app-dialog-card[data-tone="error"] .app-dialog-kicker {
    color: #ffb1b1;
    border-color: rgba(255, 92, 92, 0.22);
}

.app-dialog-card[data-tone="success"] {
    border-color: rgba(68, 214, 127, 0.4);
    box-shadow: 0 0 30px rgba(68, 214, 127, 0.12);
}

.app-dialog-card[data-tone="success"] .app-dialog-kicker {
    color: #b7ffd1;
    border-color: rgba(68, 214, 127, 0.22);
}

.app-dialog-card[data-tone="warning"] .app-dialog-kicker {
    color: #ffe7a3;
    border-color: rgba(241, 196, 15, 0.22);
}

.btn-danger {
    background: #ff3e3e;
    border: none;
    padding: 8px 14px;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
}

@media (max-width: 640px) {
    .tab-shell-header,
    .spoof-header-row {
        flex-direction: column;
        align-items: flex-start;
    }

    .steam-grid,
    .games-grid,
    .hwid-summary-row,
    .home-overview-grid,
    .home-panels-grid,
    .exit-choice-grid,
    .theme-picker-grid {
        grid-template-columns: 1fr;
    }

    .home-hero {
        flex-direction: column;
    }

    .home-hero-badge {
        width: 100%;
        text-align: left;
    }

    .home-meta-row {
        flex-direction: column;
        align-items: flex-start;
    }

    .home-meta-row strong {
        text-align: left;
    }
}

/* --- SETTINGS TAB CORE LAYOUT --- */
.settings-tab {
    width: 100%;
    box-sizing: border-box;
    min-width: 0;
}

.settings-header {
    width: 100%;
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 16px;
    box-sizing: border-box;
}

.settings-header-copy {
    min-width: 0;
}

.settings-subtitle {
    margin: 6px 0 0;
    color: var(--text-secondary);
    font-size: 0.82rem;
    line-height: 1.5;
}

.settings-badges {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    min-width: 170px;
    max-width: 100%;
    box-sizing: border-box;
}

.settings-badge {
    padding: 10px 12px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    text-align: left;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
    box-sizing: border-box;
}

.settings-badge span {
    display: block;
    color: var(--text-secondary);
    font-size: 0.65rem;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    margin-bottom: 5px;
}

.settings-badge strong {
    color: var(--text-main);
    font-size: 0.82rem;
    letter-spacing: 0.5px;
}

.settings-layout {
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
}

.settings-card {
    width: 100%;
    border-radius: 12px;
    padding: 16px;
    box-sizing: border-box;
    border: 1px solid var(--panel-border);
    background: linear-gradient(180deg, var(--panel-start), var(--panel-end));
    box-shadow: 0 14px 30px var(--panel-shadow);
}

.settings-card-head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
    width: 100%;
    box-sizing: border-box;
}

.settings-card-head h3 {
    margin: 0;
}

.settings-card-head .desc {
    margin: 6px 0 0;
    color: var(--text-secondary);
    font-size: 0.75rem;
    line-height: 1.45;
}

#settings-tab h2 {
    margin: 0;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    border-bottom: none;
    padding-bottom: 0;
}

/* --- TERMINAL / NEWS SECTION --- */
.news-section {
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.terminal-box {
    height: 208px;
    min-height: 208px;
    width: 100%;
    overflow-y: auto;
    background: radial-gradient(circle at top, rgba(var(--accent-rgb), 0.18), var(--terminal-surface) 58%);
    padding: 12px;
    border-radius: 10px;
    font-size: 12px;
    line-height: 1.55;
    color: #00ff41;
    border: 1px solid var(--panel-border-strong);
    box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.45);
    box-sizing: border-box;
}

.terminal-input-area {
    display: flex;
    align-items: center;
    margin-top: 10px;
    background: var(--terminal-surface);
    padding: 10px 12px;
    border: 1px solid var(--panel-border);
    border-radius: 10px;
    width: 100%;
    box-sizing: border-box;
}

.prompt {
    color: var(--accent);
    margin-right: 8px;
    font-weight: bold;
}

#terminal-cmd {
    background: transparent;
    border: none;
    color: #fff;
    outline: none;
    width: 100%;
    font-size: 0.78rem;
}

/* --- SETTINGS PANEL & SWITCHES --- */
.settings-panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
    box-sizing: border-box;
}

.settings-chip {
    padding: 7px 10px;
    border-radius: 999px;
    border: 1px solid var(--panel-border-strong);
    background: var(--surface-hover);
    color: var(--panel-text-strong);
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    white-space: nowrap;
    max-width: 100%;
    box-sizing: border-box;
}

.settings-group {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
}

.settings-theme-block {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px;
    border-radius: 14px;
    border: 1px solid var(--panel-border);
    background: var(--surface-muted);
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
}

.settings-theme-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
}

.theme-picker-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    width: 100%;
}

.theme-chip-btn {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px;
    border-radius: 12px;
    border: 1px solid var(--panel-border);
    background: rgba(0, 0, 0, 0.28);
    color: #e4fbff;
    text-align: left;
    transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
    box-sizing: border-box;
}

.theme-chip-btn:hover,
.theme-chip-btn.is-active {
    transform: translateY(-1px);
    border-color: var(--panel-border-focus);
    box-shadow: 0 0 14px rgba(var(--accent-rgb), 0.12);
    background: var(--surface-hover);
}

.theme-chip-swatches {
    display: inline-flex;
    gap: 6px;
    flex-shrink: 0;
}

.theme-chip-swatches span {
    width: 16px;
    height: 16px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.18);
}

.theme-chip-copy {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
}

.theme-chip-copy strong {
    color: #fff;
    font-size: 0.78rem;
    letter-spacing: 0.4px;
}

.theme-chip-copy small {
    color: var(--text-secondary);
    font-size: 0.68rem;
}

.theme-custom-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    width: 100%;
}

.theme-picker-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border-radius: 12px;
    border: 1px solid var(--panel-border);
    background: var(--surface-muted);
    box-sizing: border-box;
}

.theme-picker-field span {
    color: var(--text-secondary);
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
}

.theme-picker-field input[type="color"] {
    width: 100%;
    height: 40px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
}

.theme-custom-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    width: 100%;
}

/* CUSTOM TOGGLE SLIDER */
.switch-container {
    display: flex;
    align-items: flex-start;
    width: 100%;
    gap: 12px;
    justify-content: flex-start;
    overflow: visible;
    padding: 12px 13px;
    border-radius: 12px;
    border: 1px solid var(--panel-border);
    background: var(--surface-muted);
    transition: border-color 0.2s ease, transform 0.2s ease, background 0.2s ease;
    box-sizing: border-box;
}

.switch-container:hover {
    color: var(--accent);
    border-color: var(--panel-border-strong);
    transform: translateY(-1px);
    background: var(--surface-hover);
}

.switch-container input {
    display: none;
}

.slider {
    width: 38px;
    height: 22px;
    background-color: #333;
    display: inline-block;
    flex: none;
    border-radius: 20px;
    position: relative;
    transition: 0.25s ease;
    border: 1px solid #444;
    margin-top: 1px;
}

.slider:before {
    content: "";
    position: absolute;
    height: 14px;
    width: 14px;
    left: 3px;
    bottom: 3px;
    background-color: #888;
    border-radius: 50%;
    transition: 0.25s ease;
}

input:checked + .slider {
    background-color: rgba(var(--accent-rgb), 0.2);
    border-color: var(--accent);
}

input:checked + .slider:before {
    transform: translateX(16px);
    background-color: var(--accent);
    box-shadow: 0 0 8px var(--accent);
}

.setting-copy {
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.setting-title {
    color: var(--text-main);
    font-size: 0.84rem;
    font-weight: 700;
    letter-spacing: 0.3px;
}

.setting-meta {
    color: var(--text-secondary);
    font-size: 0.72rem;
    line-height: 1.45;
    margin-top: 3px;
}

/* --- ACTION BUTTONS --- */
.settings-quick-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
}

.settings-action {
    width: 100%;
    max-width: 100%;
    min-height: 42px;
    padding: 10px 11px;
    border-radius: 10px;
    border: 1px solid var(--panel-border-strong);
    background: var(--surface-hover);
    color: var(--panel-text-strong);
    cursor: pointer;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.7px;
    text-transform: uppercase;
    transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
    text-align: center;
    line-height: 1.3;
    box-sizing: border-box;
}

.settings-action:hover {
    background: var(--surface-hover-strong);
    color: #fff;
    transform: translateY(-1px);
    box-shadow: 0 0 14px rgba(var(--accent-rgb), 0.12);
}

.settings-action.secondary,
.settings-action.ghost {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.12);
    color: #d1d7dc;
}

.settings-action.ghost {
    min-height: 36px;
    padding: 8px 10px;
}

.settings-action.secondary:hover,
.settings-action.ghost:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: var(--panel-border-strong);
    color: #fff;
}

.settings-action.danger {
    background: rgba(255, 68, 68, 0.08);
    border-color: rgba(255, 68, 68, 0.22);
    color: #ffb0b0;
}

.settings-action.danger:hover {
    background: rgba(255, 68, 68, 0.18);
    border-color: rgba(255, 68, 68, 0.4);
    color: #fff;
    box-shadow: 0 0 14px rgba(255, 68, 68, 0.14);
}

.settings-action:disabled {
    opacity: 0.6;
    cursor: wait;
    transform: none;
    box-shadow: none;
}

.settings-footer-copy {
    color: var(--text-secondary);
    font-size: 0.72rem;
    line-height: 1.45;
    padding-top: 2px;
}

@media (max-width: 640px) {
    .settings-header,
    .settings-card-head {
        flex-direction: column;
    }

    .settings-badges,
    .settings-quick-grid,
    .theme-custom-grid,
    .theme-custom-actions {
        grid-template-columns: 1fr;
        width: 100%;
    }
}

/* TYPING ANIMATION */
.terminal-line {
    display: block;
    width: fit-content;
    max-width: 100%;
}

.typewriter {
    display: inline-block;
    overflow: hidden;
    white-space: nowrap;
    border-right: 2px solid var(--accent);
    width: fit-content;
    max-width: 100%;
    vertical-align: top;
    animation: typing 3.5s steps(40, end), blink-caret .75s step-end infinite;
}

@keyframes typing {
    from {
        clip-path: inset(0 100% 0 0);
    }

    to {
        clip-path: inset(0 0 0 0);
    }
}

@keyframes blink-caret {
    from, to {
        border-color: transparent
    }

    50% {
        border-color: var(--accent);
    }
}

::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}

::-webkit-scrollbar-track {
    background: #1a1a1a;
}

/* The draggable handle (the thumb) */
::-webkit-scrollbar-thumb {
    background: #444; /* Medium grey for the handle */
    border-radius: 10px; /* Rounded edges for a modern look */
    border: 2px solid #1a1a1a; /* Creates a small gap around the thumb */
}

    
    ::-webkit-scrollbar-thumb:hover {
        background: var(--accent-teal); /* Glows teal on hover */
    }
