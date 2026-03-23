
const API = 'https://my-auth-api-1ykc.onrender.com';

let countdownInterval;
let progress = 0;
let newsLoaded = false;
let expiryCheckInterval = null;
let isAuthProcessActive = false;
let updateReminderInterval = null;
let currentVersion = "1.1.3";
let hardwareSnapshot = null;
let hardwareSnapshotPromise = null;
let updateCheckPromise = null;
let cachedRemoteRelease = null;
let serverHealthState = "CHECKING";
let hwidResetPollInterval = null;
let hwidResetApprovalStatus = "idle";
let latestHwidResetRequestId = null;
let injectionProgressTimer = null;
let autoLoginRequestToken = 0;
let activeExternalLink = null;
let activeAppDialogResolver = null;

const themePresets = {
    default: {
        key: "default",
        label: "Default",
        accent: "#1abc9c",
        panel: "#1d2630",
        sidebar: "#1e1e1e",
        content: "#2a2a2a",
        background: "#121212"
    },
    arctic: {
        key: "arctic",
        label: "Arctic",
        accent: "#4dc9ff",
        panel: "#1c3140",
        sidebar: "#131d28",
        content: "#213041",
        background: "#0f141d"
    },
    ember: {
        key: "ember",
        label: "Ember",
        accent: "#ff8a4c",
        panel: "#35231a",
        sidebar: "#201510",
        content: "#322019",
        background: "#120c09"
    },
    emerald: {
        key: "emerald",
        label: "Emerald",
        accent: "#44d67f",
        panel: "#1b3025",
        sidebar: "#112019",
        content: "#1f3328",
        background: "#0c1410"
    },
    obsidian: {
        key: "obsidian",
        label: "Obsidian",
        accent: "#e7edf5",
        panel: "#23262b",
        sidebar: "#141414",
        content: "#21242a",
        background: "#090909"
    },
    rose: {
        key: "rose",
        label: "Rose",
        accent: "#ff6f91",
        panel: "#321d26",
        sidebar: "#24131a",
        content: "#36212b",
        background: "#130b10"
    }
};

const externalLinkConfigs = {
    discord: {
        key: "discord",
        kicker: "COMMUNITY",
        title: "Join VEXION Discord",
        body: "Open the main VEXION Discord for announcements, community updates, and live status posts.",
        url: "https://discord.gg/vCrBfRsRvb",
        confirmLabel: "OPEN DISCORD",
        note: "This opens outside the loader in your browser or Discord client."
    },
    support: {
        key: "support",
        kicker: "SHOP / SUPPORT",
        title: "Open Support Hub",
        body: "Orders, support questions, and account help are handled through the VEXION support hub.",
        url: "https://discord.gg/RG7bEgrHF9",
        confirmLabel: "OPEN SUPPORT",
        note: "If Discord is installed, the invite may open directly in the app."
    },
    github: {
        key: "github",
        kicker: "DEVELOPER",
        title: "Open GitHub",
        body: "View releases, repositories, and project updates from the developer profile.",
        url: "https://github.com/jeffyNoJumper?tab=repositories",
        confirmLabel: "OPEN GITHUB",
        note: "This opens in your default browser."
    }
};

let currentUserPrefix = localStorage.getItem('user_prefix') || "";

function showAutoLoginModal() {
    const modal = document.getElementById('auto-login-modal');
    if (!modal) return;
    modal.style.removeProperty('display');
    modal.classList.remove('hidden');
}

function hideAutoLoginModal() {
    const modal = document.getElementById('auto-login-modal');
    if (!modal) return;
    modal.style.removeProperty('display');
    modal.classList.add('hidden');
}

function setLoginNotice(message = "", state = "error") {
    const loginNotice = document.getElementById("login-notice");
    if (!loginNotice) return;

    if (message) {
        loginNotice.innerText = message;
        loginNotice.dataset.state = state;
        loginNotice.classList.remove("hidden");
        return;
    }

    loginNotice.innerText = "";
    loginNotice.classList.add("hidden");
    loginNotice.removeAttribute("data-state");
}

function focusLoginField(input) {
    if (!input) return;

    input.focus();

    if (typeof input.select === "function") {
        input.select();
    }
}

function handleLoginSubmit(event) {
    if (event) {
        event.preventDefault();
    }

    void handleLogin();
}

function showManualLoginState(noticeText = null, keepAutoLoginModal = false) {
    const loginScreen = document.getElementById("login-screen");
    const dashboard = document.getElementById("dashboard-wrapper");
    const sidebar = document.getElementById("sidebar");

    if (!keepAutoLoginModal) {
        hideAutoLoginModal();
    }
    document.body.classList.remove("logged-in");
    document.body.classList.add("login-active");

    if (loginScreen) loginScreen.style.display = "flex";
    if (dashboard) dashboard.style.display = "none";
    if (sidebar) {
        sidebar.classList.add("hidden");
        sidebar.style.removeProperty("display");
    }

    setLoginNotice(noticeText, noticeText ? "info" : "error");
}

function hoistModalToBody(id) {
    const modal = document.getElementById(id);
    if (!modal || modal.parentElement === document.body) {
        return;
    }

    document.body.appendChild(modal);
}

function getThemePreset(name) {
    return themePresets[name] || themePresets.default;
}

function normalizeHexColor(value, fallback) {
    const candidate = String(value || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(candidate)) {
        return candidate.toLowerCase();
    }

    if (/^#[0-9a-f]{3}$/i.test(candidate)) {
        const hex = candidate.slice(1);
        return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toLowerCase();
    }

    return fallback.toLowerCase();
}

function clampColorChannel(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
}

function hexToRgb(hex) {
    const cleanHex = normalizeHexColor(hex, '#000000').slice(1);
    return {
        r: parseInt(cleanHex.slice(0, 2), 16),
        g: parseInt(cleanHex.slice(2, 4), 16),
        b: parseInt(cleanHex.slice(4, 6), 16)
    };
}

function rgbToHex({ r, g, b }) {
    return `#${[r, g, b].map((channel) => clampColorChannel(channel).toString(16).padStart(2, '0')).join('')}`;
}

function mixHex(baseHex, mixHexValue, ratio = 0.5) {
    const amount = Math.max(0, Math.min(1, ratio));
    const base = hexToRgb(baseHex);
    const mix = hexToRgb(mixHexValue);

    return rgbToHex({
        r: base.r + ((mix.r - base.r) * amount),
        g: base.g + ((mix.g - base.g) * amount),
        b: base.b + ((mix.b - base.b) * amount)
    });
}

function rgbaFromHex(hex, alpha) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function rgbStringFromHex(hex) {
    const { r, g, b } = hexToRgb(hex);
    return `${r}, ${g}, ${b}`;
}

function buildThemeTokens(config = {}) {
    const accent = normalizeHexColor(config.accent, themePresets.default.accent);
    const background = normalizeHexColor(config.background, themePresets.default.background);
    const sidebar = normalizeHexColor(config.sidebar, themePresets.default.sidebar);
    const content = normalizeHexColor(config.content || config.panel || themePresets.default.content, themePresets.default.content);
    const panel = normalizeHexColor(config.panel || content, content);

    return {
        ...config,
        accent,
        panel,
        sidebar,
        content,
        background,
        accentRgb: rgbStringFromHex(accent),
        glow: rgbaFromHex(accent, 0.35),
        panelStart: rgbaFromHex(mixHex(panel, '#ffffff', 0.04), 0.96),
        panelEnd: rgbaFromHex(mixHex(panel, '#000000', 0.24), 0.94),
        panelBorder: rgbaFromHex('#ffffff', 0.08),
        panelBorderSoft: rgbaFromHex('#ffffff', 0.05),
        panelBorderStrong: rgbaFromHex(accent, 0.22),
        panelBorderFocus: rgbaFromHex(accent, 0.4),
        panelShadow: rgbaFromHex('#000000', 0.22),
        panelShadowStrong: rgbaFromHex('#000000', 0.34),
        surfaceMuted: rgbaFromHex(mixHex(panel, '#ffffff', 0.1), 0.18),
        surfaceMutedStrong: rgbaFromHex(mixHex(panel, '#ffffff', 0.12), 0.26),
        surfaceHover: rgbaFromHex(accent, 0.07),
        surfaceHoverStrong: rgbaFromHex(accent, 0.14),
        panelTextStrong: mixHex(accent, '#ffffff', 0.78),
        sidebarTint: rgbaFromHex(accent, 0.08),
        terminalSurface: rgbaFromHex(mixHex(background, '#000000', 0.25), 0.52)
    };
}

function applyThemeTokens(tokens) {
    const root = document.documentElement;
    const tokenMap = {
        '--accent-teal': tokens.accent,
        '--accent': tokens.accent,
        '--accent-rgb': tokens.accentRgb,
        '--accent-glow': tokens.glow,
        '--sidebar-bg': tokens.sidebar,
        '--content-bg': tokens.content,
        '--bg-dark': tokens.background,
        '--panel-start': tokens.panelStart,
        '--panel-end': tokens.panelEnd,
        '--panel-border': tokens.panelBorder,
        '--panel-border-soft': tokens.panelBorderSoft,
        '--panel-border-strong': tokens.panelBorderStrong,
        '--panel-border-focus': tokens.panelBorderFocus,
        '--panel-shadow': tokens.panelShadow,
        '--panel-shadow-strong': tokens.panelShadowStrong,
        '--surface-muted': tokens.surfaceMuted,
        '--surface-muted-strong': tokens.surfaceMutedStrong,
        '--surface-hover': tokens.surfaceHover,
        '--surface-hover-strong': tokens.surfaceHoverStrong,
        '--panel-text-strong': tokens.panelTextStrong,
        '--sidebar-tint': tokens.sidebarTint,
        '--terminal-surface': tokens.terminalSurface
    };

    Object.entries(tokenMap).forEach(([key, value]) => {
        root.style.setProperty(key, value);
    });
}

function syncThemeColorInputs(themeConfig = {}) {
    const accentInput = document.getElementById('theme-accent-picker');
    const panelInput = document.getElementById('theme-panel-picker');
    const sidebarInput = document.getElementById('theme-sidebar-picker');
    const backgroundInput = document.getElementById('theme-background-picker');

    if (accentInput) accentInput.value = normalizeHexColor(themeConfig.accent || themePresets.default.accent, themePresets.default.accent);
    if (panelInput) panelInput.value = normalizeHexColor(themeConfig.panel || themeConfig.content || themePresets.default.panel, themePresets.default.panel);
    if (sidebarInput) sidebarInput.value = normalizeHexColor(themeConfig.sidebar || themePresets.default.sidebar, themePresets.default.sidebar);
    if (backgroundInput) backgroundInput.value = normalizeHexColor(themeConfig.background || themePresets.default.background, themePresets.default.background);
}

function getCustomThemeFromInputs() {
    const preset = getThemePreset('default');
    return {
        key: 'custom',
        label: 'Custom',
        accent: document.getElementById('theme-accent-picker')?.value || preset.accent,
        panel: document.getElementById('theme-panel-picker')?.value || preset.panel,
        sidebar: document.getElementById('theme-sidebar-picker')?.value || preset.sidebar,
        content: document.getElementById('theme-panel-picker')?.value || preset.content,
        background: document.getElementById('theme-background-picker')?.value || preset.background
    };
}

function updateThemeButtonState(activeTheme) {
    document.querySelectorAll('.theme-chip-btn').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.theme === activeTheme);
    });
}

function applyThemePreset(name = "default", options = {}) {
    const { persist = true, announce = false } = options;
    const preset = buildThemeTokens(getThemePreset(name));

    applyThemeTokens(preset);
    syncThemeColorInputs(preset);

    updateThemeButtonState(preset.key);

    if (persist) {
        localStorage.setItem('loader-theme', preset.key);
        localStorage.removeItem('loader-theme-custom');
    }

    if (announce) {
        addTerminalLine(`> [THEME] ${preset.label.toUpperCase()} preset applied.`);
        setSettingsStatus(`${preset.label.toUpperCase()} THEME`);
    }

    return preset;
}

function initializeLoaderTheme() {
    const savedTheme = localStorage.getItem('loader-theme') || 'default';

    if (savedTheme === 'custom') {
        try {
            const customTheme = JSON.parse(localStorage.getItem('loader-theme-custom') || '{}');
            const customTokens = buildThemeTokens({
                ...getThemePreset('default'),
                ...customTheme,
                key: 'custom',
                label: 'Custom'
            });
            applyThemeTokens(customTokens);
            syncThemeColorInputs(customTokens);
            updateThemeButtonState('custom');
            return;
        } catch (error) {
            console.error("[THEME] Failed to restore custom theme:", error);
        }
    }

    applyThemePreset(savedTheme, { persist: false, announce: false });
}

function updateVersionLabels() {
    const safeVersion = currentVersion || "UNKNOWN";
    const versionLabel = document.getElementById("loader-version");
    const legacyVersionLabel = document.getElementById("loader-version-legacy");
    const settingsVersion = document.getElementById("settings-build-version");

    if (versionLabel) versionLabel.innerText = safeVersion;
    if (legacyVersionLabel) legacyVersionLabel.innerText = safeVersion;
    if (settingsVersion) settingsVersion.innerText = safeVersion;
}

async function syncInstalledVersion() {
    try {
        const appVersion = await window.api.getAppVersion?.();
        const normalizedVersion = normalizeVersionString(appVersion);
        if (normalizedVersion) {
            currentVersion = normalizedVersion;
        } else if (typeof appVersion === 'string' && appVersion.trim()) {
            currentVersion = appVersion.trim();
        }
    } catch (error) {
        console.error("[VERSION] Failed to load installed app version:", error);
    } finally {
        updateVersionLabels();
    }
}

function setLoaderTheme(name) {
    applyThemePreset(name, { persist: true, announce: true });
}

function applyCustomThemeFromInputs() {
    const customTheme = getCustomThemeFromInputs();
    const customTokens = buildThemeTokens(customTheme);

    applyThemeTokens(customTokens);
    syncThemeColorInputs(customTokens);
    updateThemeButtonState('custom');
    localStorage.setItem('loader-theme', 'custom');
    localStorage.setItem('loader-theme-custom', JSON.stringify(customTheme));
    addTerminalLine("> [THEME] CUSTOM colors applied.");
    setSettingsStatus("CUSTOM THEME");
}

function resetCustomTheme() {
    applyThemePreset('default', { persist: true, announce: true });
}

function renderAppDialogActions(actions = []) {
    const actionsHost = document.getElementById('app-dialog-actions');
    if (!actionsHost) {
        return;
    }

    actionsHost.innerHTML = "";

    actions.forEach((action) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = action.label;
        button.className = action.variant === 'danger'
            ? 'btn-danger'
            : action.variant === 'secondary'
                ? 'btn-secondary'
                : 'btn-primary';

        button.addEventListener('click', () => {
            closeModal('app-dialog-modal');

            const resolver = activeAppDialogResolver;
            activeAppDialogResolver = null;

            if (resolver) {
                resolver(action.value);
            }
        });

        actionsHost.appendChild(button);
    });
}

function showAppDialog(options = {}) {
    const {
        title = "Notification",
        message = "",
        detail = "",
        tone = "info",
        kicker = "SYSTEM NOTICE",
        actions = [{ label: "OK", value: true, variant: "primary" }]
    } = options;

    const card = document.getElementById('app-dialog-card');
    const kickerEl = document.getElementById('app-dialog-kicker');
    const titleEl = document.getElementById('app-dialog-title');
    const messageEl = document.getElementById('app-dialog-message');
    const detailEl = document.getElementById('app-dialog-detail');

    if (!card || !kickerEl || !titleEl || !messageEl || !detailEl) {
        return Promise.resolve(false);
    }

    if (activeAppDialogResolver) {
        activeAppDialogResolver(false);
        activeAppDialogResolver = null;
    }

    card.dataset.tone = tone;
    kickerEl.textContent = kicker;
    titleEl.textContent = title;
    messageEl.textContent = message;
    detailEl.textContent = detail || "";
    detailEl.classList.toggle('hidden', !detail);
    renderAppDialogActions(actions);
    activeExternalLink = null;
    closeModal('external-link-modal');
    openModal('app-dialog-modal');

    return new Promise((resolve) => {
        activeAppDialogResolver = resolve;
    });
}

function showSuccessDialog(title, message, detail = "") {
    return showAppDialog({
        title,
        message,
        detail,
        tone: "success",
        kicker: "SUCCESS",
        actions: [{ label: "OK", value: true, variant: "primary" }]
    });
}

function showErrorDialog(title, message, detail = "") {
    return showAppDialog({
        title,
        message,
        detail,
        tone: "error",
        kicker: "ERROR",
        actions: [{ label: "OK", value: true, variant: "danger" }]
    });
}

function showConfirmDialog(title, message, options = {}) {
    return showAppDialog({
        title,
        message,
        detail: options.detail || "",
        tone: options.tone || "warning",
        kicker: options.kicker || "CONFIRM ACTION",
        actions: [
            { label: options.cancelLabel || "Cancel", value: false, variant: "secondary" },
            { label: options.confirmLabel || "Continue", value: true, variant: options.confirmVariant || "primary" }
        ]
    });
}

function closeExternalLinkModal() {
    activeExternalLink = null;
    closeModal('external-link-modal');
}

function showExternalActionModal(key) {
    const modal = document.getElementById('external-link-modal');
    const config = externalLinkConfigs[key];

    if (!modal || !config) {
        return;
    }

    hideUserDropdown();
    activeExternalLink = config;

    const kickerEl = document.getElementById('external-link-kicker');
    const titleEl = document.getElementById('external-link-title');
    const copyEl = document.getElementById('external-link-copy');
    const urlEl = document.getElementById('external-link-url');
    const noteEl = document.getElementById('external-link-note');
    const confirmButton = document.getElementById('external-link-confirm');

    if (kickerEl) kickerEl.textContent = config.kicker;
    if (titleEl) titleEl.textContent = config.title;
    if (copyEl) copyEl.textContent = config.body;
    if (urlEl) urlEl.textContent = config.url;
    if (noteEl) noteEl.textContent = config.note;
    if (confirmButton) confirmButton.textContent = config.confirmLabel;

    modal.classList.remove('hidden');
}

async function confirmExternalLink() {
    if (!activeExternalLink?.url) {
        return;
    }

    try {
        await window.api.openExternal(activeExternalLink.url);
        addTerminalLine(`> [LINK] Opening ${activeExternalLink.title.toUpperCase()}...`);
        setSettingsStatus("OPENING LINK");
        closeExternalLinkModal();
    } catch (err) {
        console.error("[LINK] Failed to open external link:", err);
        closeExternalLinkModal();
        await showErrorDialog("Link Launch Failed", "The loader could not open the external destination.", err?.message || "");
    }
}

async function copyExternalLink() {
    if (!activeExternalLink?.url) {
        return;
    }

    try {
        await navigator.clipboard.writeText(activeExternalLink.url);
        addTerminalLine(`> [LINK] Copied ${activeExternalLink.title.toUpperCase()} URL.`);
        setSettingsStatus("LINK COPIED");
    } catch (err) {
        console.error("[LINK] Failed to copy URL:", err);
        await showErrorDialog("Copy Failed", "The loader could not copy the external link to your clipboard.", err?.message || "");
    }
}

async function loadHardwareSnapshot(forceRefresh = false) {
    if (forceRefresh) {
        hardwareSnapshot = null;
        hardwareSnapshotPromise = null;
    }

    if (hardwareSnapshot) {
        return hardwareSnapshot;
    }

    if (!hardwareSnapshotPromise) {
        hardwareSnapshotPromise = window.api.getHardwareSnapshot(forceRefresh)
            .then((snapshot) => {
                hardwareSnapshot = snapshot;
                return snapshot;
            })
            .catch((err) => {
                hardwareSnapshotPromise = null;
                throw err;
            });
    }

    return hardwareSnapshotPromise;
}

function setSettingsStatus(message) {
    const statusChip = document.getElementById('settings-status-note');
    if (statusChip) {
        statusChip.textContent = message;
    }
}

function getCurrentLicenseKey() {
    return (localStorage.getItem('license_key') || '').trim().toUpperCase();
}

function getCurrentPrefix() {
    const key = getCurrentLicenseKey();
    return currentUserPrefix || (key.includes('-') ? key.split('-')[0].toUpperCase() : "NONE");
}

function getAccessPlanLabel(prefix) {
    const planMap = {
        ALLX: "ALL ACCESS",
        LIFE: "LIFETIME",
        CS2X: "CS2 ACCESS",
        FIVM: "FIVEM ACCESS",
        GTAV: "GTAV ACCESS",
        WARZ: "WARZONE ACCESS"
    };

    return planMap[prefix] || "PENDING";
}

function maskLicenseKey(key) {
    if (!key) {
        return "Awaiting redeem";
    }

    if (key.length <= 10) {
        return key;
    }

    return `${key.slice(0, 5)}••••-${key.slice(-4)}`;
}

function getHomeExpirySnapshot(expiry, prefix) {
    if (prefix === "ALLX" || prefix === "LIFE") {
        return {
            label: "LIFETIME",
            detail: "Permanent access enabled on this account.",
            color: "var(--gold)"
        };
    }

    if (!expiry || expiry === "null") {
        return {
            label: "PENDING",
            detail: "No active subscription timer detected yet.",
            color: "var(--text-secondary)"
        };
    }

    const expiryDate = new Date(expiry);
    const expiryTime = expiryDate.getTime();

    if (Number.isNaN(expiryTime)) {
        return {
            label: "PENDING",
            detail: "Subscription timing data is unavailable.",
            color: "var(--text-secondary)"
        };
    }

    const diff = expiryTime - Date.now();

    if (diff <= 0) {
        return {
            label: "EXPIRED",
            detail: `Expired on ${expiryDate.toLocaleString()}`,
            color: "var(--red)"
        };
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    if (days >= 1) {
        return {
            label: `${days} DAY${days === 1 ? "" : "S"}`,
            detail: `Expires on ${expiryDate.toLocaleString()}`,
            color: "#d7fff6"
        };
    }

    return {
        label: `${hours}h ${minutes}m ${seconds}s`,
        detail: `Less than 24 hours remain. Ends ${expiryDate.toLocaleTimeString()}.`,
        color: "var(--accent)"
    };
}

function updateHomeServerStatusUI() {
    const statusEl = document.getElementById('home-server-status');
    const copyEl = document.getElementById('home-server-copy');

    if (!statusEl || !copyEl) {
        return;
    }

    statusEl.className = 'home-status-pill';

    if (serverHealthState === "ONLINE") {
        statusEl.classList.add('online');
        statusEl.textContent = "ONLINE";
        copyEl.textContent = "Auth API is reachable and responding normally.";
        return;
    }

    if (serverHealthState === "OFFLINE") {
        statusEl.classList.add('offline');
        statusEl.textContent = "OFFLINE";
        copyEl.textContent = "The API health check failed. Launch actions may be unavailable.";
        return;
    }

    statusEl.classList.add('checking');
    statusEl.textContent = "CHECKING";
    copyEl.textContent = "Syncing loader health...";
}

function stopInjectionProgressAnimation() {
    if (injectionProgressTimer) {
        clearInterval(injectionProgressTimer);
        injectionProgressTimer = null;
    }
}

function setInjectionProgress(percent, message, tone = "active") {
    const bar = document.getElementById('main-progress-bar');
    const text = document.getElementById('status-text');
    const percentText = document.getElementById('status-percent');

    if (bar) {
        bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
        bar.classList.remove('is-success', 'is-error');
        if (tone === "success") {
            bar.classList.add('is-success');
        } else if (tone === "error") {
            bar.classList.add('is-error');
        }
    }

    if (text && message) {
        text.textContent = message;
        text.style.color = tone === "error"
            ? "var(--red)"
            : tone === "success"
                ? "#8cffde"
                : "var(--accent)";
    }

    if (percentText) {
        percentText.textContent = `${Math.max(0, Math.min(100, percent))}%`;
    }
}

function resetInjectionProgressUI() {
    stopInjectionProgressAnimation();
    setInjectionProgress(0, "INITIALIZING...");
}

function startInjectionProgressAnimation(gameName) {
    const steps = [
        { percent: 12, message: `AUTHENTICATING ${gameName.toUpperCase()}...` },
        { percent: 28, message: "SECURING SESSION..." },
        { percent: 45, message: `COMMUNICATING WITH ${gameName.toUpperCase()}...` }
    ];

    let stepIndex = 0;
    setInjectionProgress(steps[0].percent, steps[0].message);
    stopInjectionProgressAnimation();

    injectionProgressTimer = setInterval(() => {
        stepIndex += 1;
        if (stepIndex >= steps.length) {
            stopInjectionProgressAnimation();
            return;
        }

        const step = steps[stepIndex];
        setInjectionProgress(step.percent, step.message);
    }, 420);
}

async function loadNews(forceRefresh = false) {
    const terminal = document.getElementById('main-terminal');
    if (!terminal) return;

    if (newsLoaded && !forceRefresh) {
        return;
    }

    setSettingsStatus("SYNCING FEED");

    try {
        const news = await window.api.getNews();
        const rememberState = localStorage.getItem('remember-me') === 'true' ? "ENABLED" : "DISABLED";
        const lines = [
            `> [STATUS] Loader ready on v${currentVersion}.`,
            `> [CLIENT] Remember Me: ${rememberState}.`,
            "> [LOCAL] Settings apply instantly and save to this device."
        ];

        if (news) {
            lines.push(...news.split('\n').filter(Boolean));
        }

        terminal.innerHTML = "";

        lines.forEach((line, index) => {
            const entry = document.createElement('div');
            entry.className = index === 0 ? 'typewriter terminal-line' : 'terminal-line';
            entry.innerText = line;
            terminal.appendChild(entry);
        });

        newsLoaded = true;
        setSettingsStatus("FEED READY");
    } catch (err) {
        console.error("[NEWS] Failed to load terminal feed:", err);
        terminal.innerHTML = "";
        addTerminalLine("> [ERROR] Failed to load terminal feed.");
        setSettingsStatus("FEED ERROR");
    }
}

function normalizeVersionString(version) {
    return String(version || '')
        .trim()
        .replace(/^v/i, '')
        .replace(/[^0-9.]/g, '');
}

function compareVersions(leftVersion, rightVersion) {
    const left = normalizeVersionString(leftVersion).split('.').map((part) => parseInt(part || '0', 10));
    const right = normalizeVersionString(rightVersion).split('.').map((part) => parseInt(part || '0', 10));
    const maxLength = Math.max(left.length, right.length);

    for (let index = 0; index < maxLength; index += 1) {
        const leftPart = Number.isFinite(left[index]) ? left[index] : 0;
        const rightPart = Number.isFinite(right[index]) ? right[index] : 0;

        if (leftPart > rightPart) return 1;
        if (leftPart < rightPart) return -1;
    }

    return 0;
}

function isRemoteReleaseNewer(release) {
    if (!release?.version) {
        return false;
    }

    return compareVersions(release.version, currentVersion) > 0;
}

function canInstallRelease(release) {
    return Boolean(release?.url && isRemoteReleaseNewer(release));
}

async function runManualUpdateCheck() {
    const button = document.getElementById('check-updates-btn');
    const originalText = button ? button.textContent : "";

    if (button) {
        button.disabled = true;
        button.textContent = "CHECKING...";
    }

    setSettingsStatus("CHECKING UPDATES");

    try {
        const release = await checkForUpdates({ manual: true });

        if (canInstallRelease(release)) {
            addTerminalLine(`> [UPDATE] New build detected: ${release.version}`);
            setSettingsStatus("UPDATE AVAILABLE");
        } else if (release?.version && compareVersions(release.version, currentVersion) < 0) {
            addTerminalLine(`> [UPDATE] Remote manifest is older (${release.version}). Staying on ${currentVersion}.`);
            setSettingsStatus("UP TO DATE");
        } else if (release?.version && compareVersions(release.version, currentVersion) === 0) {
            addTerminalLine(`> [UPDATE] Already on the latest build (${currentVersion}).`);
            setSettingsStatus("UP TO DATE");
        } else if (release?.version && !release?.url) {
            addTerminalLine(`> [UPDATE] Manifest found for ${release.version}, but no installer URL is published yet.`);
            setSettingsStatus("PACKAGE PENDING");
        } else {
            addTerminalLine(`> [UPDATE] Already on the latest build (${currentVersion}).`);
            setSettingsStatus("UP TO DATE");
        }
    } catch (err) {
        addTerminalLine("> [ERROR] Update check failed.");
        setSettingsStatus("UPDATE ERROR");
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = originalText || "CHECK FOR UPDATES";
        }
    }
}

function openExitModal() {
    hideUserDropdown();
    openModal('exit-modal');
}

function exitApplication() {
    closeModal('exit-modal');
    if (window.api?.close) {
        window.api.close();
    }
}

async function initializeLoader() {
    const el = (id) => document.getElementById(id);

    const savedPfp = localStorage.getItem('saved_profile_pic');
    if (savedPfp) {
        if (el('user-pic')) el('user-pic').src = savedPfp;
        if (el('modal-pfp')) el('modal-pfp').src = savedPfp;
    }

    void updateHWIDDisplay().catch(console.error);
    void checkServer().catch(console.error);

    if (typeof checkForUpdates === "function") {
        void checkForUpdates().catch((err) => {
            console.error("[UPDATE] Version check failed:", err);
        });
    }

    if (el('update-overlay')) el('update-overlay').classList.add('hidden');

    const savedEmail = localStorage.getItem('remembered_email');
    const savedPass = localStorage.getItem('remembered_password');
    const savedExpiry = localStorage.getItem('expiry_date');
    const rememberMe = localStorage.getItem('remember-me') === 'true';

    const autoLoginModal = el('auto-login-modal');

    if (rememberMe && savedEmail && savedPass) {
        const now = Date.now();
        const expTime = savedExpiry ? new Date(savedExpiry).getTime() : now + 1000;

        if (now < expTime || isNaN(expTime)) {
            console.log("[SECURITY] Valid session found. Auto logging in...");

            if (el('login-email')) el('login-email').value = savedEmail;
            if (el('login-password')) el('login-password').value = savedPass;
            if (autoLoginModal) showAutoLoginModal();
            if (el('auto-login-user')) el('auto-login-user').innerText = savedEmail;
            showManualLoginState(null, true);

            const requestToken = ++autoLoginRequestToken;
            handleLogin(true, { email: savedEmail, password: savedPass, requestToken })
                .then(() => console.log("[SYSTEM] Auto-login complete"))
                .catch(err => console.error("[AUTOLOGIN ERROR]", err));

            return;
        } else {
            console.warn("[SECURITY] Session expired.");
            localStorage.removeItem('remembered_password');
            localStorage.removeItem('expiry_date');
            localStorage.removeItem('remember-me');
        }
    }

    console.log("[SYSTEM] No valid session. Showing login screen.");

    showManualLoginState("No valid session found. Please log in manually.");
}

document.addEventListener('DOMContentLoaded', () => {
    hoistModalToBody('register-modal');
    hoistModalToBody('auto-login-modal');
    hoistModalToBody('external-link-modal');
    hoistModalToBody('app-dialog-modal');
    initializeLoaderTheme();
    updateVersionLabels();
    void syncInstalledVersion();
    void initializeLoader();
});

function cancelAutoLogin() {
    autoLoginRequestToken += 1;
    showManualLoginState("Auto-login cancelled. You can log in manually or create an account.");
    isAuthProcessActive = false;
}
function toggleDropdown() {
    document.getElementById('user-dropdown').classList.toggle('hidden');
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
    if (!key) {
        await showErrorDialog("License Required", "Redeem a license key from your profile before launching a game.");
        openModal('settings-modal');
        return;
    }

    const autoCloseActive = document.getElementById('auto-close-launcher').checked;

    const injectionModal = document.getElementById('injection-modal');

    let injectionType = "external";

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
    if (injectionModal) {
        resetInjectionProgressUI();
        injectionModal.classList.remove('hidden');
        startInjectionProgressAnimation(gameName);
    }

    addTerminalLine(`> [SYSTEM] Initializing ${gameName.toUpperCase()}...`);

    const rawEmail = localStorage.getItem("user_email");
    const rawExpiry = localStorage.getItem("expiry_date");

    function getDaysRemaining(expiry) {
        if (!expiry) return "Unknown";

        const now = new Date();
        const exp = new Date(expiry);

        const diff = exp - now;
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

        if (days <= 0) return "Expired";
        if (days > 3650) return "Lifetime";

        return `${days} days`;
    }

    const userData = {
        username: rawEmail ? rawEmail.split("@")[0] : "Guest",
        subscription: rawExpiry && new Date(rawExpiry) > new Date() ? "Premium" : "Expired",
        expiry: rawExpiry
    };

    // Pass userData as the 5th argument to your launch function
    const result = await window.api.launchCheat(gameName, autoCloseActive, key, injectionType, userData);

    if (result.status === "Success") {
        stopInjectionProgressAnimation();
        setInjectionProgress(100, "INJECTION SUCCESSFUL!", "success");

        setTimeout(() => {
            injectionModal?.classList.add('hidden');
            resetInjectionProgressUI();
        }, 3000);
    } else {
        stopInjectionProgressAnimation();
        setInjectionProgress(100, "INJECTION FAILED", "error");
        setTimeout(() => {
            injectionModal?.classList.add('hidden');
            resetInjectionProgressUI();
        }, 3000);
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
        'auto-update-loader',
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
            applySettingValue(id, e.target.checked);
        });
    });

    ['theme-accent-picker', 'theme-panel-picker', 'theme-sidebar-picker', 'theme-background-picker'].forEach((id) => {
        const input = document.getElementById(id);
        if (!input) {
            return;
        }

        input.addEventListener('input', () => {
            setSettingsStatus("CUSTOM THEME READY");
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
        case 'auto-update-loader':
            setSettingsStatus(value ? "AUTO UPDATE ON" : "AUTO UPDATE OFF");
            if (value) {
                void checkForUpdates();
            }
            break;

        case 'discord-rpc':
            const rpcCheckbox = document.getElementById('discord-rpc');
            if (rpcCheckbox) rpcCheckbox.disabled = true;

            window.api.toggleDiscord(value);
            addTerminalLine(`> [SYSTEM] Synchronizing Discord RPC...`);
            setSettingsStatus(value ? "RPC ENABLED" : "RPC DISABLED");

            setTimeout(() => {
                if (rpcCheckbox) rpcCheckbox.disabled = false;
            }, 2000);
            break;

        case 'stream-proof':
            window.api.toggleStreamProof(value);
            setSettingsStatus(value ? "STREAM PROOF ON" : "STREAM PROOF OFF");
            break;

        case 'auto-launch':
            if (window.api.toggleAutoLaunch) window.api.toggleAutoLaunch(value);
            setSettingsStatus(value ? "AUTO LAUNCH ON" : "AUTO LAUNCH OFF");
            break;

        case 'auto-close-launcher':
            addTerminalLine(`> [SYSTEM] Preference saved: ${value ? 'EXIT_ON_INJECT' : 'STAY_OPEN'}`);
            setSettingsStatus(value ? "AUTO CLOSE ON" : "AUTO CLOSE OFF");
            break;
    }
}

function formatSettingKey(id) {
    return id.replace(/-/g, '_').toUpperCase();
}

function applySettingValue(id, value) {
    const input = document.getElementById(id);
    const normalizedValue = Boolean(value);

    if (!input) {
        return false;
    }

    input.checked = normalizedValue;
    localStorage.setItem(id, String(normalizedValue));
    handleSettingChange(id, normalizedValue);
    addTerminalLine(`> [CONFIG] ${formatSettingKey(id)} set to ${normalizedValue ? 'ON' : 'OFF'}`);
    return true;
}

function showTerminalCommandHelp() {
    [
        "> Available commands:",
        "> help, clear, status, refresh, check updates",
        "> home, games, hwid, spoofing, settings",
        "> auto launch on/off, auto update on/off, auto close on/off",
        "> discord on/off, stream proof on/off",
        "> open discord, open support, open github",
        "> theme default, arctic, ember, emerald, obsidian, rose",
        "> theme custom, theme reset"
    ].forEach(addTerminalLine);
}

function showSystemStatus() {
    const savedTheme = localStorage.getItem('loader-theme') || 'default';
    const themeLabel = savedTheme === 'custom'
        ? 'CUSTOM'
        : getThemePreset(savedTheme).label.toUpperCase();
    addTerminalLine(`> [STATUS] API: ${serverHealthState}`);
    addTerminalLine(`> [STATUS] THEME: ${themeLabel}`);
    addTerminalLine(`> [STATUS] AUTO_UPDATE: ${document.getElementById('auto-update-loader')?.checked ? 'ON' : 'OFF'}`);
    addTerminalLine(`> [STATUS] AUTO_CLOSE: ${document.getElementById('auto-close-launcher')?.checked ? 'ON' : 'OFF'}`);
    addTerminalLine(`> [STATUS] RPC: ${document.getElementById('discord-rpc')?.checked ? 'ON' : 'OFF'} | STREAM_PROOF: ${document.getElementById('stream-proof')?.checked ? 'ON' : 'OFF'}`);
}

function parseSettingToggleCommand(command) {
    const togglePatterns = [
        { regex: /^(?:set )?auto launch (on|off)$/i, id: 'auto-launch' },
        { regex: /^(?:set )?auto update(?: loader)? (on|off)$/i, id: 'auto-update-loader' },
        { regex: /^(?:set )?auto close(?: launcher)? (on|off)$/i, id: 'auto-close-launcher' },
        { regex: /^(?:set )?discord(?: rpc)? (on|off)$/i, id: 'discord-rpc' },
        { regex: /^(?:set )?stream proof (on|off)$/i, id: 'stream-proof' }
    ];

    for (const pattern of togglePatterns) {
        const match = command.match(pattern.regex);
        if (match) {
            return {
                id: pattern.id,
                value: match[1].toLowerCase() === 'on'
            };
        }
    }

    return null;
}

async function runTerminalCommand(rawCommand) {
    const command = rawCommand.trim().replace(/\s+/g, ' ').toLowerCase();
    if (!command) {
        return;
    }

    addTerminalLine(`SK-USER:~$ ${rawCommand.trim()}`);

    if (command === 'clear' || command === 'cls') {
        clearLogs();
        return;
    }

    if (command === 'help') {
        showTerminalCommandHelp();
        return;
    }

    if (command === 'status') {
        showSystemStatus();
        return;
    }

    if (command === 'refresh' || command === 'refresh feed' || command === 'news') {
        newsLoaded = false;
        await loadNews(true);
        addTerminalLine("> [FEED] Terminal refreshed.");
        return;
    }

    if (command === 'update' || command === 'check update' || command === 'check updates' || command === 'check for updates') {
        await runManualUpdateCheck();
        return;
    }

    if (command === 'reset' || command === 'reset settings' || command === 'factory reset') {
        await resetConfig();
        return;
    }

    if (command === 'home' || command === 'games' || command === 'hwid' || command === 'spoofing' || command === 'settings') {
        showTab(command);
        addTerminalLine(`> [NAV] Switched to ${command.toUpperCase()}.`);
        return;
    }

    if (command === 'discord' || command === 'open discord') {
        showExternalActionModal('discord');
        return;
    }

    if (command === 'shop' || command === 'support' || command === 'shop support' || command === 'open shop' || command === 'open support') {
        showExternalActionModal('support');
        return;
    }

    if (command === 'github' || command === 'open github') {
        showExternalActionModal('github');
        return;
    }

    if (command === 'theme custom') {
        applyCustomThemeFromInputs();
        return;
    }

    if (command === 'theme reset') {
        resetCustomTheme();
        return;
    }

    if (
        command === 'theme default' ||
        command === 'theme arctic' ||
        command === 'theme ember' ||
        command === 'theme emerald' ||
        command === 'theme obsidian' ||
        command === 'theme rose'
    ) {
        setLoaderTheme(command.split(' ')[1]);
        return;
    }

    const toggleCommand = parseSettingToggleCommand(command);
    if (toggleCommand) {
        applySettingValue(toggleCommand.id, toggleCommand.value);
        return;
    }

    addTerminalLine(`> Unknown command: ${command}`);
    addTerminalLine("> Type HELP for the available client controls.");
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
        if (typeof syncHwidResetApprovalState === "function") {
            void syncHwidResetApprovalState(true).catch(console.error);
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

async function updateHWIDDisplay(forceRefresh = false) {
    try {
        console.log("Refreshing Hardware Terminal...");

        const hwidElem = document.getElementById('hwid-id');
        const serialElem = document.getElementById('serial-id');
        const gpuElem = document.getElementById('gpu-id');

        if (hwidElem) hwidElem.innerText = "FETCHING...";
        if (serialElem) serialElem.innerText = "FETCHING...";
        if (gpuElem) gpuElem.innerText = "FETCHING...";

        const { machineId, serial, gpu } = await loadHardwareSnapshot(forceRefresh);

        if (hwidElem) hwidElem.innerText = machineId || "N/A";
        if (serialElem) serialElem.innerText = serial || "N/A";
        if (gpuElem) gpuElem.innerText = gpu || "N/A";

        console.log("Terminal Refreshed. New HWID:", machineId);

    } catch (err) {
        console.error("Failed to update terminal:", err);
    }
}

async function handleLogin(isAutoLogin = false, creds = {}) {
    if (isAuthProcessActive && !isAutoLogin) return;

    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');
    const email = (isAutoLogin ? creds.email : emailInput?.value || '').trim();
    const password = isAutoLogin ? (creds.password || '') : (passwordInput?.value || '');
    const requestToken = isAutoLogin ? creds.requestToken : null;
    const rememberMe = document.getElementById('remember-me')?.checked;
    const btn = document.getElementById('login-btn');
    const autoLoginModal = document.getElementById("auto-login-modal");

    // ---------- NO CREDENTIALS FOUND ----------
    if (!email || !password) {
        if (isAutoLogin) {
            if (autoLoginModal) hideAutoLoginModal();
            setLoginNotice("No valid session found. Please login manually.", "info");
        } else {
            setLoginNotice("Enter your email and password.");
            focusLoginField(!email ? emailInput : passwordInput);
        }
        return;
    }

    isAuthProcessActive = true;
    if (!isAutoLogin) {
        setLoginNotice("");
    }

    // Spinner for manual login
    if (btn && !isAutoLogin) {
        btn.innerHTML = `<div class="spinner"></div>`;
        btn.disabled = true;
    }

    try {
        const { machineId: hwid } = await loadHardwareSnapshot();

        const res = await fetch(`${API}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, hwid })
        });

        const data = await res.json();

        if (isAutoLogin && requestToken !== autoLoginRequestToken) {
            return;
        }

        if (data.token === "VALID") {
            console.log("[AUTH] LOGIN SUCCESS");

            const username = email.split("@")[0];

            window.currentUser = {
                username: username,
                subscription: data.subscription || "Premium",
                expiry: data.expiry
            };

            // Hide auto-login modal
            if (autoLoginModal) hideAutoLoginModal();
            setLoginNotice("");

            // ---------- SAVE SESSION ----------
            localStorage.setItem("user_email", email);
            localStorage.setItem("expiry_date", data.expiry);

            if (rememberMe || isAutoLogin) {
                localStorage.setItem("remember-me", "true");
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
            //const username = email.split("@")[0];
            const userDisplay = document.getElementById("user-display-name");
            if (userDisplay) userDisplay.innerText = username;

            const navName = document.getElementById("nav-username");
            if (navName) navName.innerText = username;

            const expiryDisplay = document.getElementById("user-expiry");
            if (expiryDisplay) expiryDisplay.innerText = "EXP: " + new Date(data.expiry).toLocaleDateString();

            const homeExpiry = document.getElementById("home-exp");
            if (homeExpiry) homeExpiry.innerText = new Date(data.expiry).toLocaleDateString();

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

            if (typeof showTab === "function") showTab("home");
            console.log("[SYSTEM] Dashboard loaded successfully.");
        } else {
            // Failed login
            if (autoLoginModal) hideAutoLoginModal();

            if (isAutoLogin) {
                setLoginNotice("No valid session found. Please login manually.", "info");
            } else {
                const errorMessage = data.error || "Invalid credentials.";
                const shouldEditEmail = /user not found|invalid email|email/i.test(errorMessage);

                setLoginNotice(errorMessage);
                focusLoginField(shouldEditEmail ? emailInput : passwordInput);
            }
        }
    } catch (err) {
        console.error("[AUTH ERROR]", err);
        if (!isAutoLogin) {
            setLoginNotice("API connection error. Check the server and try again.");
            focusLoginField(passwordInput || emailInput);
        }
    } finally {
        isAuthProcessActive = false;

        if (btn && !isAutoLogin) {
            btn.innerHTML = "LOGIN";
            btn.disabled = false;
        }
    }
}

async function updateUserInfoDisplay(email, status = "Online") {
    // 1. Get the actual hardware ID from the computer
    const { machineId: realHWID } = await loadHardwareSnapshot();
    
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
    const email = localStorage.getItem("user_email") || "";
    const expiry = localStorage.getItem("expiry_date");
    const key = getCurrentLicenseKey();
    const prefix = getCurrentPrefix();
    const username = email ? email.split("@")[0].toUpperCase() : "USER";
    const expirySnapshot = getHomeExpirySnapshot(expiry, prefix);

    const welcomeText = document.getElementById("home-welcome");
    const homeUsername = document.getElementById("home-username");
    const homeExp = document.getElementById("home-exp");
    const homePlan = document.getElementById("home-plan");
    const homeLicense = document.getElementById("home-license");
    const homeExpiryNote = document.getElementById("home-expiry-note");
    const homeEmail = document.getElementById("home-email");
    const homeSessionKey = document.getElementById("home-session-key");
    const homeFocusNote = document.getElementById("home-focus-note");
    const sidebarName = document.getElementById("user-display-name");
    const sidebarExpiry = document.getElementById("user-expiry");

    if (sidebarName && email) {
        sidebarName.innerText = email.split("@")[0];
    }

    if (homeUsername) {
        homeUsername.textContent = username;
    }

    if (welcomeText) {
        welcomeText.textContent = email
            ? `${getAccessPlanLabel(prefix)} synced and standing by for your next launch.`
            : "Sign in to sync your loader session and module access.";
    }

    if (homeExp) {
        homeExp.textContent = expirySnapshot.label;
        homeExp.style.color = expirySnapshot.color;
    }

    if (homeExpiryNote) {
        homeExpiryNote.textContent = expirySnapshot.detail;
    }

    if (window.homeTileInterval) {
        clearInterval(window.homeTileInterval);
    }

    window.homeTileInterval = setInterval(() => {
        const liveSnapshot = getHomeExpirySnapshot(localStorage.getItem('expiry_date'), getCurrentPrefix());
        const liveExp = document.getElementById("home-exp");
        const liveNote = document.getElementById("home-expiry-note");

        if (liveExp) {
            liveExp.textContent = liveSnapshot.label;
            liveExp.style.color = liveSnapshot.color;
        }

        if (liveNote) {
            liveNote.textContent = liveSnapshot.detail;
        }
    }, 1000);

    if (homePlan) {
        homePlan.textContent = getAccessPlanLabel(prefix);
    }

    if (homeLicense) {
        homeLicense.textContent = key ? `Key: ${maskLicenseKey(key)}` : "No license linked yet";
    }

    if (homeEmail) {
        homeEmail.textContent = email || "Not signed in";
    }

    if (homeSessionKey) {
        homeSessionKey.textContent = maskLicenseKey(key);
    }

    if (homeFocusNote) {
        homeFocusNote.textContent = key
            ? "Games and HWID panels are ready for review before launch."
            : "Link or redeem a license before trying to inject a module.";
    }

    if (sidebarExpiry) {
        if (prefix === "ALLX" || prefix === "LIFE") {
            sidebarExpiry.innerText = "EXP: LIFETIME";
        } else if (expiry) {
            sidebarExpiry.innerText = "EXP: " + new Date(expiry).toLocaleDateString();
        } else {
            sidebarExpiry.innerText = "EXP: PENDING";
        }
    }

    updateHomeServerStatusUI();

    console.log("[HOME] UI Synced:", {
        email,
        expiry,
        prefix
    });
}


async function handleRegister() {
    const email = document.getElementById('reg-email').value.trim();
    const pass = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;
    const btn = document.getElementById('register-btn');

    // ---------- BASIC FIELD CHECKS ----------
    if (!email || !pass || !confirm) {
        await showErrorDialog("Registration Incomplete", "All registration fields are required.");
        return;
    }

    if (pass !== confirm) {
        await showErrorDialog("Passwords Do Not Match", "Re-enter the same password in both registration fields.");
        return;
    }

    // ---------- EMAIL FORMAT VALIDATION ----------
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        await showErrorDialog("Invalid Email", "Enter a valid email address before creating the account.");
        return;
    }

    // ---------- OPTIONAL: FRONTEND EMAIL VERIFICATION ----------
    try {
        // Kickbox / similar service API example
        const verifyRes = await fetch(`https://open.kickbox.com/v1/disposable/${email}`);
        const verifyData = await verifyRes.json();

        if (verifyData.disposable) {
            await showErrorDialog("Disposable Email Blocked", "Disposable or fake emails are not allowed. Use a real email address.");
            return;
        }
    } catch (err) {
        console.warn("[EMAIL VERIFY] Could not verify email, proceeding anyway.", err);
        // optional: continue registration or block
    }

    btn.innerHTML = `<div class="spinner"></div> CREATING...`;
    btn.disabled = true;

    try {
        const { machineId: hwid } = await loadHardwareSnapshot();

        // ---------- SEND TO BACKEND ----------
        const response = await fetch(`${API}/register`, {
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
            await showSuccessDialog("Account Ready", data.message || "Account created successfully. You can now log in.");
            closeModal('register-modal');
        } else if (data.error === "invalid_email") {
            await showErrorDialog("Registration Failed", "Email is invalid or disposable.");
        } else {
            await showErrorDialog("Registration Failed", data.error || "Unknown error");
        }

    } catch (err) {
        console.error("Register Error:", err);
        await showErrorDialog("Registration Server Unreachable", "Failed to connect to the registration server.", err?.message || "");
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

    void showErrorDialog("Access Denied", `Your current key (${prefix}) is not valid for ${gameName}.`);
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
    const currentPrefix = getCurrentPrefix();
    const expiry = localStorage.getItem('expiry_date');
    const email = localStorage.getItem('user_email') || "User";

    const navExp = document.getElementById('user-expiry');

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

    if (typeof updateHomeTabUI === "function") {
        updateHomeTabUI();
    }

    console.log(`[UI] Sync Complete for: ${email}`);
}


function togglePasswordVisibility(inputId = 'login-password') {
    const passwordInput = document.getElementById(inputId);
    const toggle = document.getElementById('toggle-password');

    if (!passwordInput || !toggle) {
        return;
    }

    const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
    passwordInput.setAttribute('type', type);
    toggle.textContent = type === 'password' ? 'SHOW' : 'HIDE';
}

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
    const rememberEnabled = localStorage.getItem('remember-me') === 'true';

    if (savedEmail && emailInput) emailInput.value = savedEmail;
    if (savedPass && passInput) passInput.value = savedPass;
    if (savedKey && licenseInput) licenseInput.value = savedKey;

    [emailInput, passInput].forEach((input) => {
        input?.addEventListener('input', () => {
            setLoginNotice("");
        });
    });

    // Check the box if they have saved credentials
    if (rememberCheckbox) rememberCheckbox.checked = rememberEnabled;

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
                    const { machineId: realHWID } = await loadHardwareSnapshot();
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

    if (!newKey) {
        await showErrorDialog("License Key Missing", "Enter a valid license key before redeeming.");
        return;
    }

    if (redeemBtn) {
        redeemBtn.innerText = "REDEEMING...";
        redeemBtn.disabled = true;
    }

    try {
        const { machineId: hwid } = await loadHardwareSnapshot();
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
            await showSuccessDialog("Subscription Updated", data.message || "The new license key was redeemed successfully.");

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
            await showErrorDialog("Redeem Failed", data.error || "Unknown error");
        }
    } catch (err) {
        console.error("Redeem Error:", err);
        await showErrorDialog("Connection Error", "The loader could not reach the redemption server.", err?.message || "");
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

    if (id === 'external-link-modal') {
        activeExternalLink = null;
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
    const licenseInput = document.getElementById('edit-license');
    const btn = document.getElementById('save-profile-btn');

    if (!btn) return;

    const userEmail = localStorage.getItem('user_email');
    if (!userEmail) {
        await showErrorDialog("Session Error", "No user email was found for this session. Log in again and retry.");
        return;
    }

    btn.innerText = "SAVING...";
    btn.disabled = true;

    try {
        const cleanAPI = API.endsWith('/') ? API.slice(0, -1) : API;
        const url = `${cleanAPI}/update-profile`;

        // COMPRESSION STEP: Only compress if a new image was picked
        let profilePicData = window.tempPfp;
        if (profilePicData && profilePicData.startsWith('data:image')) {
            console.log("[SYSTEM] Compressing image to bypass server limits...");
            profilePicData = await compressImage(window.tempPfp);
        }

        const payload = {
            user_id_email: userEmail.toLowerCase(),
            new_license_key: licenseInput?.value?.trim().toUpperCase() || null,
            email: emailInput?.value || null,
            password: passwordInput?.value || null,
            profile_pic: profilePicData // Use the (potentially) compressed version
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        // Check if the response is actually JSON to avoid the "<!DOCTYPE" error
        const contentType = response.headers.get("content-type");
        if (!response.ok || !contentType.includes("application/json")) {
            const errorText = await response.text();
            throw new Error(`Server returned error ${response.status}: ${errorText.substring(0, 50)}`);
        }

        const data = await response.json();

        if (data.success) {
            if (emailInput?.value) localStorage.setItem('user_email', emailInput.value);
            if (payload.new_license_key) localStorage.setItem('license_key', payload.new_license_key);

            if (profilePicData) {
                localStorage.setItem('saved_profile_pic', profilePicData);
                document.querySelectorAll('#user-pic, #modal-pfp').forEach(img => img.src = profilePicData);
            }

            await showSuccessDialog("Profile Updated", "Profile changes were saved successfully.");
            if (typeof closeModal === "function") closeModal('settings-modal');
        } else {
            await showErrorDialog("Profile Update Failed", data.error || "Unknown error");
        }
    } catch (e) {
        console.error("[SAVE PROFILE ERROR]", e);
        await showErrorDialog("Save Failed", "Profile changes could not be saved. The image may still be too large or the server may be unavailable.", e?.message || "");
    } finally {
        btn.innerText = "SAVE CHANGES";
        btn.disabled = false;
    }
}

// ---------------- GLOBAL STATE ----------------

let selectedSpoofMode = "hwid";
let spoofState = "idle";


// ---------------- MODE TOGGLE ----------------

function setSpoofMode(mode) {

    selectedSpoofMode = mode;

    document.querySelectorAll(".mode-btn")
        .forEach(btn => btn.classList.remove("active"));

    document.getElementById(`mode-${mode}`)?.classList.add("active");

    updateModeDescription();
}

window.setSpoofMode = setSpoofMode;


// ---------------- STATUS UI ----------------

function updateSpoofStatus(state) {

    spoofState = state;

    const status = document.getElementById("spoof-main-status");
    const subtext = document.getElementById("spoof-subtext");

    if (!status || !subtext) return;

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


// ---------------- MODE DESCRIPTION ----------------

function updateModeDescription() {

    const title = document.getElementById("spoof-action-title");
    const desc = document.getElementById("spoof-action-desc");

    if (!title || !desc) return;

    if (selectedSpoofMode === "hwid") {
        title.textContent = "Natural Spoof (Permanent)";
        desc.textContent = "Firmware-level hardware masking.";
    }

    if (selectedSpoofMode === "traces") {
        title.textContent = "Trace Cleaner (Temporary)";
        desc.textContent = "Removes local tracking artifacts.";
    }
}


// ---------------- DOM READY ----------------

document.addEventListener("DOMContentLoaded", () => {

    updateSpoofStatus("inactive");
    updateModeDescription();
    setHwidResetControls("idle");

    // ---------- CHECKBOX MODALS ----------

    const modalMap = {
        "bios-flash": "biosflash-modal",
        "clean-reg": "registryclean-modal",
        "clean-disk": "diskclean-modal",
        "deep-clean": "deepclean-modal"
    };

    Object.entries(modalMap).forEach(([checkboxId, modalId]) => {

        const checkbox = document.getElementById(checkboxId);
        const modal = document.getElementById(modalId);

        if (!checkbox || !modal) return;

        checkbox.addEventListener("click", (e) => {

            if (!checkbox.checked) return;

            e.preventDefault();
            modal.classList.remove("hidden");

        });

        const confirmBtn =
            modal.querySelector("[id$='confirm']") ||
            modal.querySelector("[id$='save']");

        const cancelBtn = modal.querySelector("[id$='cancel']");

        confirmBtn?.addEventListener("click", () => {
            checkbox.checked = true;
            modal.classList.add("hidden");
        });

        cancelBtn?.addEventListener("click", () => {
            checkbox.checked = false;
            modal.classList.add("hidden");
        });

    });


    // ---------- MOTHERBOARD ICON ----------

    const motherboardSelect = document.getElementById("motherboard-select");
    const mbIcon = document.getElementById("mb-icon");

    const motherboardIcons = {
        asus: "imgs/asus.png",
        msi: "imgs/msi.png",
        gigabyte: "imgs/gigabyte.png",
        asrock: "imgs/asrock.png",
        other: "imgs/motherboard.png"
    };

    motherboardSelect?.addEventListener("change", () => {

        const brand = motherboardSelect.value;
        mbIcon.src = motherboardIcons[brand] || motherboardIcons.other;

    });

});


// ---------------- SPOOF EXECUTION ----------------

async function startSpoofing() {
    const loader = document.getElementById("spoof-progress");
    const spinner = document.getElementById("spoof-spinner");
    const success = document.getElementById("spoof-success");
    const el = (id) => document.getElementById(id); // Move helper to top

    if (spoofState === "running") return;

    const isDeepClean = el("deep-clean")?.checked;

    if (isDeepClean) {
        const confirmClean = await showConfirmDialog(
            "Deep Clean Warning",
            "Deep Clean will wipe game logs and traces from this system.",
            {
                detail: "To escape a shadow ban, you must use a new game account after this. Logging into a flagged account can immediately re-ban the hardware.",
                confirmLabel: "Run Deep Clean",
                confirmVariant: "danger",
                kicker: "HIGH RISK ACTION"
            }
        );
        if (!confirmClean) return;
    }

    spoofState = "running";
    loader?.classList.remove("hidden");
    spinner?.classList.remove("hidden");
    success?.classList.add("hidden");

    try {
        // 1. GATHER DATA (No nested function needed)
        const cs2 = el("clean-cs2")?.checked || false;
        const gtav = el("clean-gtav")?.checked || false;
        const fivem = el("clean-fivem")?.checked || false;
        const cod = el("clean-cod")?.checked || false;

        const options = {
            motherboard: el("motherboard-select")?.value || "asus",
            biosFlash: el("bios-flash")?.checked || false,
            cleanReg: el("clean-reg")?.checked || false,
            cleanDisk: el("clean-disk")?.checked || false,
            deepClean: isDeepClean || false,
            user: typeof selectedSpoofMode !== 'undefined' && selectedSpoofMode === "hwid",
            disk: typeof selectedSpoofMode !== 'undefined' && selectedSpoofMode === "traces",
            cleanCS2: cs2,
            cleanGTAV: gtav,
            cleanFiveM: fivem,
            cleanCOD: cod,
            newMachineGuid: crypto.randomUUID()
        };

        console.log("[SYSTEM] Starting Spoof with Options:", options);

        // 2. EXECUTE
        const result = await window.api.startSpoof(options);

        // 3. HANDLE RESULT
        if (result) { // If C++ returns the object {User: true, Kernel: true...}
            const state = (typeof selectedSpoofMode !== 'undefined' && selectedSpoofMode === "hwid") ? "perm" : "temp";

            updateSpoofStatus(state);
            localStorage.setItem("spoofState", state);
            await updateHWIDDisplay(true);

            spinner?.classList.add("hidden");
            success?.classList.remove("hidden");
            document.querySelector(".shield-img").src = "imgs/green-check.svg";

            const statusText = document.getElementById("spoof-main-status");
            if (statusText) {
                statusText.textContent = "SPOOFED";
                statusText.classList.remove("status-inactive");
                statusText.classList.add("status-active");
            }

            await showSuccessDialog("Spoof Complete", "Please restart your PC before launching the game.");
        } else {
            await showErrorDialog("Spoof Failed", "The spoofing flow did not finish successfully. Check the logs and try again.");
            updateSpoofStatus("inactive");
            loader?.classList.add("hidden");
        }

    } catch (err) {
        console.error("[UI SPOOF ERROR]", err);
        updateSpoofStatus("inactive");
        loader?.classList.add("hidden");
    } finally {
        spoofState = "idle";
    }
}

function getHwidResetConsumedStorageKey() {
    const key = getCurrentLicenseKey() || "GLOBAL";
    return `hwid-reset-consumed:${key}`;
}

function getConsumedHwidResetRequestId() {
    return localStorage.getItem(getHwidResetConsumedStorageKey()) || "";
}

function markHwidResetConsumed(requestId) {
    if (!requestId) {
        return;
    }

    localStorage.setItem(getHwidResetConsumedStorageKey(), requestId);
}

function clearConsumedHwidResetRequest() {
    localStorage.removeItem(getHwidResetConsumedStorageKey());
}

function stopHwidResetPolling() {
    if (hwidResetPollInterval) {
        clearInterval(hwidResetPollInterval);
        hwidResetPollInterval = null;
    }
}

function appendAdminRequestLog(message) {
    const terminal = document.getElementById('admin-terminal');
    if (!terminal) {
        return;
    }

    const entry = document.createElement('div');
    entry.className = 'log-entry';

    if (message.includes("PENDING")) entry.style.color = "var(--gold)";
    if (message.includes("APPROVED")) entry.style.color = "var(--accent)";
    if (message.includes("DENIED") || message.includes("FAILED")) entry.style.color = "var(--red)";

    entry.innerHTML = `<span class="prompt">></span> ${message}`;
    terminal.appendChild(entry);
    terminal.scrollTop = terminal.scrollHeight;
}

function resetAdminRequestLog(message = "SYSTEM_IDLE: WAITING FOR REQUEST...") {
    const terminal = document.getElementById('admin-terminal');
    if (!terminal) {
        return;
    }

    terminal.innerHTML = "";
    appendAdminRequestLog(message);
}

function setHwidResetControls(state, detail = "") {
    const resetBtn = document.getElementById('reset-btn');
    const requestBtn = document.getElementById('admin-request-btn');
    const statusEl = document.getElementById('hwid-main-status');
    const requestStateEl = document.getElementById('hwid-request-state');
    const statusLine = document.getElementById('hwid-status');

    hwidResetApprovalStatus = state;

    const applyState = (statusText, statusClass, requestState, resetText, resetDisabled, requestText, requestDisabled, note) => {
        if (statusEl) {
            statusEl.textContent = statusText;
            statusEl.className = statusClass;
        }

        if (requestStateEl) {
            requestStateEl.textContent = requestState;
        }

        if (resetBtn) {
            resetBtn.textContent = resetText;
            resetBtn.disabled = resetDisabled;
        }

        if (requestBtn) {
            requestBtn.textContent = requestText;
            requestBtn.disabled = requestDisabled;
        }

        if (statusLine) {
            statusLine.textContent = detail || note;
        }
    };

    switch (state) {
        case "pending":
            applyState(
                "REQUEST PENDING",
                "processing",
                "PENDING REVIEW",
                "WAITING FOR APPROVAL",
                true,
                "REQUEST PENDING",
                true,
                "Admin request submitted. The reset button unlocks only after approval."
            );
            break;
        case "approved":
            applyState(
                "ADMIN APPROVED",
                "active-status",
                "APPROVED",
                "HWID RESET",
                false,
                "APPROVED",
                true,
                "Approval received. You can now run the HWID reset once."
            );
            break;
        case "running":
            applyState(
                "APPLYING RESET",
                "processing",
                "CONSUMING APPROVAL",
                "RESETTING...",
                true,
                "APPROVED",
                true,
                "Applying the approved reset locally on this machine."
            );
            break;
        case "completed":
            applyState(
                "RESET APPLIED",
                "active-status",
                "APPROVAL USED",
                "REQUEST NEW APPROVAL",
                true,
                "REQUEST AGAIN",
                false,
                "Latest approval has been used. Request a new approval before resetting again."
            );
            break;
        case "denied":
            applyState(
                "REQUEST DENIED",
                "inactive",
                "DENIED",
                "WAITING FOR APPROVAL",
                true,
                "REQUEST AGAIN",
                false,
                "Admin denied the last request. Submit a new request if you still need a reset."
            );
            break;
        case "error":
            applyState(
                "STATUS UNAVAILABLE",
                "inactive",
                "SYNC ERROR",
                "WAITING FOR APPROVAL",
                true,
                "TRY AGAIN",
                false,
                "Unable to sync approval state right now. Try again in a moment."
            );
            break;
        default:
            applyState(
                "APPROVAL REQUIRED",
                "processing",
                "AWAITING APPROVAL",
                "WAITING FOR APPROVAL",
                true,
                "REQUEST HWID RESET",
                false,
                "Request approval from admin before the HWID reset can run."
            );
            break;
    }
}

async function fetchHwidResetStatus(savedKey) {
    const statusCheck = await fetch(`${API}/check-reset-status?key=${savedKey}`);
    return statusCheck.json();
}

function applyHwidResetStatus(statusData, logTransition = true) {
    const normalizedStatus = (statusData?.status || "NONE").toUpperCase();
    const requestId = statusData?.requestId || null;
    const consumedRequestId = getConsumedHwidResetRequestId();
    const previousStatus = hwidResetApprovalStatus;

    if (requestId) {
        latestHwidResetRequestId = requestId;
    }

    if (normalizedStatus === "PENDING") {
        setHwidResetControls("pending");
        if (logTransition && previousStatus !== "pending") {
            appendAdminRequestLog("STATUS: PENDING APPROVAL.");
        }
        return;
    }

    if (normalizedStatus === "APPROVED") {
        stopHwidResetPolling();

        if (requestId && requestId === consumedRequestId) {
            setHwidResetControls("completed");
            return;
        }

        setHwidResetControls("approved");
        if (logTransition && previousStatus !== "approved") {
            appendAdminRequestLog("STATUS: APPROVED. RESET UNLOCKED.");
        }
        return;
    }

    if (normalizedStatus === "DENIED") {
        stopHwidResetPolling();
        setHwidResetControls("denied");
        if (logTransition && previousStatus !== "denied") {
            appendAdminRequestLog("STATUS: DENIED BY ADMIN.");
        }
        return;
    }

    if (normalizedStatus === "ERROR") {
        setHwidResetControls("error");
        return;
    }

    stopHwidResetPolling();

    if (requestId && requestId === consumedRequestId) {
        setHwidResetControls("completed");
        return;
    }

    setHwidResetControls("idle");
}

function beginHwidResetPolling(savedKey) {
    stopHwidResetPolling();

    hwidResetPollInterval = setInterval(async () => {
        try {
            const statusData = await fetchHwidResetStatus(savedKey);
            applyHwidResetStatus(statusData);
        } catch (error) {
            console.error("[HWID] Polling error:", error);
        }
    }, 5000);
}

async function syncHwidResetApprovalState(logTransition = false) {
    const savedKey = getCurrentLicenseKey();

    if (!savedKey) {
        stopHwidResetPolling();
        setHwidResetControls("idle", "Sign in with an active license before requesting a reset.");
        return;
    }

    try {
        const statusData = await fetchHwidResetStatus(savedKey);
        applyHwidResetStatus(statusData, logTransition);

        if ((statusData?.status || "").toUpperCase() === "PENDING") {
            beginHwidResetPolling(savedKey);
        }
    } catch (error) {
        console.error("[HWID] Failed to sync approval state:", error);
        setHwidResetControls("error");
    }
}

async function requestHWIDReset() {
    if (hwidResetApprovalStatus !== "approved") {
        appendAdminRequestLog("RESET LOCKED: WAIT FOR ADMIN APPROVAL.");
        setHwidResetControls("idle", "Reset is locked until the admin request panel shows approval.");
        return;
    }

    const requestId = latestHwidResetRequestId;
    setHwidResetControls("running");
    appendAdminRequestLog("APPROVAL VERIFIED. APPLYING LOCAL RESET...");

    try {
        const results = await window.api.startSpoof({
            disk: true,
            guid: true,
            kernel: true,
            user: true,
            cleanReg: true,
            cleanDisk: true,
            deepClean: true
        });

        if (!results) {
            throw new Error("Reset process returned no result");
        }

        appendAdminRequestLog("LOCAL RESET COMPLETE. REFRESHING HARDWARE READOUT...");
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await updateHWIDDisplay(true);

        if (requestId) {
            markHwidResetConsumed(requestId);
        }

        setHwidResetControls("completed", "Reset applied locally. Restart or re-login before the next session if needed.");
        appendAdminRequestLog("APPROVAL CONSUMED. REQUEST A NEW APPROVAL FOR ANOTHER RESET.");
    } catch (err) {
        console.error("❌ Reset Error:", err);
        setHwidResetControls("approved", "Reset failed locally. Approval is still available, so you can retry.");
        appendAdminRequestLog("LOCAL RESET FAILED. APPROVAL REMAINS AVAILABLE.");
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
        const hwidEl = document.getElementById('hwid-id');
        const hwid = hwidEl ? hwidEl.innerText : "UNKNOWN";
        const savedKey = getCurrentLicenseKey();

        if (!savedKey) {
            resetAdminRequestLog("ERROR: LICENSE DATA NOT FOUND. PLEASE RE-LOGIN.");
            setHwidResetControls("idle", "A valid license is required before a reset request can be sent.");
            return;
        }

        resetAdminRequestLog("CONNECTING TO AUTH SERVER...");
        setHwidResetControls("pending", "Submitting your reset request to the admin panel.");

        try {
            const response = await fetch(`${API}/request-hwid-reset`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hwid, license_key: savedKey, type: "ADMIN-PANEL_RESET" })
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || "Request rejected");
            }

            latestHwidResetRequestId = data.requestId || latestHwidResetRequestId;
            clearConsumedHwidResetRequest();
            appendAdminRequestLog(data.message === "Request already pending." ? "REQUEST ALREADY PENDING." : "REQUEST SENT TO ADMIN.");
            appendAdminRequestLog("STATUS: PENDING APPROVAL.");
            beginHwidResetPolling(savedKey);
        } catch (err) {
            console.error("[HWID] Request failed:", err);
            setHwidResetControls("error", "Request failed to send. Check your connection and try again.");
            appendAdminRequestLog("CRITICAL: API CONNECTION FAILED.");
        }
    }

    async function checkServer() {
        const statusDot = document.getElementById('status-dot');
        const API = "https://my-auth-api-1ykc.onrender.com";

    try {
        const response = await fetch(`${API}/health`);
        if (response.ok) {
            serverHealthState = "ONLINE";
            if (statusDot) {
                statusDot.className = "status-dot dot-online";
                console.log("✅ Render API: Online");
            }
        } else {
            throw new Error();
        }
    } catch (err) {
        serverHealthState = "OFFLINE";
        if (statusDot) {
            statusDot.className = "status-dot dot-offline";
            console.log("❌ Render API: Offline");
        }
    }

    updateHomeServerStatusUI();
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

    // Terminal Input Handler
    const terminalInput = document.getElementById('terminal-cmd');
    if (terminalInput) {
        terminalInput.addEventListener('keydown', async function (e) {
            if (e.key !== 'Enter') {
                return;
            }

            e.preventDefault();
            const rawCommand = e.target.value.trim();
            if (!rawCommand) {
                return;
            }

            e.target.value = "";
            await runTerminalCommand(rawCommand);

            const box = document.getElementById('main-terminal');
            if (box) {
                box.scrollTop = box.scrollHeight;
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
            terminal.innerHTML = '<div id="news-feed-text" class="typewriter">> [SYSTEM] Logs cleared. Awaiting fresh terminal feed...</div>';
            newsLoaded = false;
            setSettingsStatus("TERMINAL CLEARED");
            console.log("[UI] Terminal logs cleared by user.");
        }
    }
    async function resetConfig() {
        const confirmed = await showConfirmDialog(
            "Reset Client Settings",
            "This will clear saved loader preferences for this device and restart the UI.",
            {
                detail: "This does not delete your account. It only resets local loader preferences.",
                confirmLabel: "Reset Now",
                confirmVariant: "danger"
            }
        );

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

            initializeLoaderTheme();

            addTerminalLine("> [SYSTEM] Configuration reset. Reloading UI...");
            setSettingsStatus("RESETTING");
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
        showExternalActionModal('support');
    }

    function openSocial(platform) {
        const target = platform === 'discord' ? 'discord' : platform === 'github' ? 'github' : 'support';
        showExternalActionModal(target);
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
        closeModal('exit-modal');
        hideUserDropdown();
        stopHwidResetPolling();
        localStorage.removeItem('user_prefix');
        localStorage.removeItem('user_email');
        localStorage.removeItem('license_key');
        localStorage.removeItem('expiry_date');
        localStorage.removeItem('remembered_password');
        localStorage.setItem('remember-me', 'false');

        if (window.api && window.api.toggleDiscord) {
            window.api.toggleDiscord(false);
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
        stopHwidResetPolling();
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
        updateVersionLabels();
        void syncInstalledVersion();

        if (localStorage.getItem('auto-update-loader') === 'true') {
            void checkForUpdates();
        }
    });

    // ==== AUTO-UPDATE FUNCTION ====
async function checkForUpdates(options = {}) {
    const { manual = false } = options;

    if (updateCheckPromise) {
        return updateCheckPromise;
    }

    updateCheckPromise = (async () => {
        try {
            const release = await window.api.getLatestRelease();
            cachedRemoteRelease = release || null;
            const updateModal = document.getElementById("update-modal");

            if (canInstallRelease(release)) {
                document.getElementById("update-version").innerText = release.version;
                updateModal?.classList.remove("hidden");
                if (manual) {
                    setSettingsStatus("UPDATE AVAILABLE");
                }
            } else {
                updateModal?.classList.add("hidden");

                if (manual && release?.version && compareVersions(release.version, currentVersion) < 0) {
                    setSettingsStatus("UP TO DATE");
                } else if (manual && release?.version && compareVersions(release.version, currentVersion) === 0) {
                    setSettingsStatus("UP TO DATE");
                } else if (manual && release?.version && !release?.url) {
                    setSettingsStatus("PACKAGE PENDING");
                } else if (manual) {
                    setSettingsStatus("UP TO DATE");
                }
            }
            return release;
        } catch (err) {
            console.error("Check failed:", err);
            if (manual) {
                setSettingsStatus("UPDATE ERROR");
            }
            throw err;
        } finally {
            updateCheckPromise = null;
        }
    })();

    return updateCheckPromise;
}

    // ==== UPDATE MODAL FUNCTIONS ====
    async function updateNow() {

        try {
            const release = cachedRemoteRelease || await window.api.getLatestRelease();
            cachedRemoteRelease = release || null;

            if (!canInstallRelease(release)) {
                throw new Error("No newer published installer is available yet.");
            }

            const filePath = await window.api.downloadUpdate(
                release.url,
                release.name
            );

            await window.api.runUpdate(filePath);

            await showSuccessDialog("Update Ready", "The update finished downloading. The installer is launching now.");

            setTimeout(() => {
                closeModal('update-modal');
            }, 2000);

            window.close();

        } catch (err) {

            console.error("Update failed:", err);
            await showErrorDialog("Update Failed", "The loader could not finish the update. Try again.", err?.message || "");

        }
    }

    function updateLater() {
        const autoUpdateEnabled = localStorage.getItem('auto-update-loader') === 'true';

        // Hide the modal immediately
        document.getElementById("update-modal").classList.add("hidden");
        setSettingsStatus(autoUpdateEnabled ? "AUTO UPDATE ON" : "REMINDER SNOOZED");

        if (autoUpdateEnabled) return;

        // Otherwise, schedule reminder toast every 5 minutes
        if (!updateReminderInterval) {
            updateReminderInterval = setInterval(() => {
                showUpdateReminder();
            }, 5 * 60 * 1000); // 5 minutes
        }
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

document.addEventListener("DOMContentLoaded", () => {

    const savedState = localStorage.getItem("spoofState");

    if (savedState === "perm" || savedState === "temp") {

        const status = document.getElementById("spoof-main-status");

        status.textContent = "SPOOFED";
        status.classList.remove("status-inactive");
        status.classList.add("status-active");

        // change shield → green check
        document.querySelector(".shield-img").src = "imgs/green-check.svg";

    }

});

function resetSpoofUI() {

    localStorage.removeItem("spoofState");

    const status = document.getElementById("spoof-main-status");

    status.textContent = "NOT SPOOFED";
    status.classList.remove("status-active");
    status.classList.add("status-inactive");

    document.querySelector(".shield-img").src = "imgs/shield.svg";
}

async function compressImage(base64Str, maxWidth = 400, maxHeight = 400) {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width *= maxHeight / height;
                    height = maxHeight;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            // 0.7 = 70% quality, significantly reducing byte size
            resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
    });
}
