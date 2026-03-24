
const API = 'https://my-auth-api-1ykc.onrender.com';

let countdownInterval;
let progress = 0;
let newsLoaded = false;
let expiryCheckInterval = null;
let expirySequenceTriggered = false;
let isAuthProcessActive = false;
let updateReminderInterval = null;
let currentVersion = "1.1.3";
let machineIdCache = null;
let machineIdPromise = null;
let hardwareSnapshot = null;
let hardwareSnapshotPromise = null;
let updateCheckPromise = null;
let cachedRemoteRelease = null;
let serverHealthState = "CHECKING";
let hwidResetPollInterval = null;
let hwidResetApprovalStatus = "idle";
let latestHwidResetRequestId = null;
let latestHwidResetTicketNumber = null;
let injectionProgressTimer = null;
let autoLoginRequestToken = 0;
let activeExternalLink = null;
let activeAppDialogResolver = null;
let activeGameLaunchResolver = null;
let gameFeedRefreshInterval = null;
let discordAnnouncementPollInterval = null;
let latestDiscordAnnouncementId = localStorage.getItem('last_seen_discord_loader_notification_id') || "";
const expiryLockedTabs = new Set(['games', 'hwid', 'spoofing', 'settings']);

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

const gameModuleConfigs = {
    CS2: {
        key: "CS2",
        displayName: "CS2",
        prefix: "CS2X",
        launcher: "Steam",
        modalCopy: "Choose the CS2 route you want to use before the Steam handoff begins.",
        internalNote: "Uses the CS2 DLL injector path from assets.",
        externalNote: "Uses the CS2 external EXE route from assets."
    },
    FIVEM: {
        key: "FIVEM",
        displayName: "FiveM",
        prefix: "FIVM",
        launcher: "CFX Launcher",
        modalCopy: "FiveM launch routing is ready now. Its internal and external slots will light up when you add the FiveM binaries.",
        internalNote: "Requires a FiveM DLL module in assets.",
        externalNote: "Requires a FiveM EXE module in assets."
    },
    GTAV: {
        key: "GTAV",
        displayName: "GTA V",
        prefix: "GTAV",
        launcher: "Rockstar",
        modalCopy: "GTA V is prepared for a dedicated internal and external route as soon as the GTA module files are added.",
        internalNote: "Requires a GTA V DLL module in assets.",
        externalNote: "Requires a GTA V EXE module in assets."
    },
    WARZONE: {
        key: "WARZONE",
        displayName: "Warzone",
        prefix: "WARZ",
        launcher: "Battle.net / Xbox",
        modalCopy: "Warzone now uses the same module select flow, and its buttons will go live once the Warzone assets are present.",
        internalNote: "Requires a Warzone DLL module in assets.",
        externalNote: "Requires a Warzone EXE module in assets."
    }
};

function normalizeGameName(gameName = "") {
    const value = String(gameName || "").trim().toUpperCase();

    switch (value) {
        case "FIVEM":
            return "FIVEM";
        case "GTA V":
        case "GTAV":
            return "GTAV";
        case "WARZONE":
            return "WARZONE";
        case "CS2":
            return "CS2";
        default:
            return value;
    }
}

function getGameModuleConfig(gameName) {
    const normalized = normalizeGameName(gameName);
    return gameModuleConfigs[normalized] || {
        key: normalized,
        displayName: String(gameName || normalized),
        prefix: normalized,
        launcher: "Launcher",
        modalCopy: "Choose the module route you want to use for this title.",
        internalNote: "Internal route requires a matching DLL module in assets.",
        externalNote: "External route requires a matching EXE module in assets."
    };
}

function getGameAssetFolderName(gameName) {
    return normalizeGameName(gameName).toLowerCase().replace(/\s+/g, '-');
}

async function getGameModuleAvailability(gameName) {
    if (!window.api?.getGameModuleAvailability) {
        return { hasInternal: false, hasExternal: false };
    }

    try {
        return await window.api.getGameModuleAvailability(gameName);
    } catch (error) {
        console.warn("[MODULE CHECK ERROR]", error);
        return { hasInternal: false, hasExternal: false };
    }
}

function updateGameFeedCard(card, feed) {
    if (!card || !feed) {
        return;
    }

    const title = card.querySelector('[data-game-feed-title]');
    const copy = card.querySelector('[data-game-feed-copy]');
    const meta = card.querySelector('[data-game-feed-meta]');

    if (title && feed.title) {
        title.textContent = feed.title;
    }

    if (copy && feed.summary) {
        copy.textContent = feed.summary;
    }

    if (meta && feed.meta) {
        meta.textContent = feed.meta;
    }
}

async function refreshGameCardFeeds() {
    if (!window.api?.getGameLiveFeed) {
        return;
    }

    const cards = Array.from(document.querySelectorAll('.game-card[data-game]'));

    await Promise.all(cards.map(async (card) => {
        try {
            const feed = await window.api.getGameLiveFeed(card.dataset.game || "");
            updateGameFeedCard(card, feed);
        } catch (error) {
            console.warn("[GAME FEED UI ERROR]", card.dataset.game, error);
        }
    }));
}

function startGameFeedRefreshLoop() {
    if (gameFeedRefreshInterval) {
        clearInterval(gameFeedRefreshInterval);
    }

    gameFeedRefreshInterval = setInterval(() => {
        void refreshGameCardFeeds();
    }, 5 * 60 * 1000);
}

function applyModuleAvailabilityToChoice(button, isAvailable) {
    if (!button) {
        return;
    }

    button.disabled = !isAvailable;
    button.classList.toggle("is-unavailable", !isAvailable);
}

function updateGameLaunchModal(gameName, availability) {
    const config = getGameModuleConfig(gameName);
    const assetFolder = `assets/${getGameAssetFolderName(gameName)}/`;
    const hasInternal = Boolean(availability?.hasInternal);
    const hasExternal = Boolean(availability?.hasExternal);
    const hasAnyModule = hasInternal || hasExternal;
    const title = document.getElementById("game-launch-title");
    const kicker = document.getElementById("game-launch-kicker");
    const status = document.getElementById("game-launch-status");
    const copy = document.getElementById("game-launch-copy");
    const update = document.getElementById("game-launch-update");
    const internalNote = document.getElementById("game-launch-internal-note");
    const externalNote = document.getElementById("game-launch-external-note");
    const internalButton = document.getElementById("game-launch-internal");
    const externalButton = document.getElementById("game-launch-external");

    if (title) title.textContent = `${config.displayName.toUpperCase()} MODULE SELECT`;
    if (kicker) kicker.textContent = `${config.launcher.toUpperCase()} ROUTE`;
    if (copy) copy.textContent = config.modalCopy;
    if (internalNote) internalNote.textContent = config.internalNote;
    if (externalNote) externalNote.textContent = config.externalNote;

    if (status) {
        status.classList.toggle("is-pending", !hasAnyModule || !hasInternal || !hasExternal);
        if (!hasAnyModule) {
            status.textContent = "AWAITING BINARIES";
        } else if (hasInternal && hasExternal) {
            status.textContent = "READY";
        } else {
            status.textContent = "PARTIAL";
        }
    }

    if (update) {
        if (!hasAnyModule) {
            update.textContent = `${config.displayName} does not have module binaries yet. Drop its DLL and EXE into ${assetFolder} and these buttons will enable automatically.`;
        } else if (!hasInternal || !hasExternal) {
            update.textContent = `${config.displayName} has only one launch route available right now. Add the missing binary into ${assetFolder} to unlock the full selector.`;
        } else {
            update.textContent = `${config.displayName} binaries are present. The loader will use the matching file from ${assetFolder} for the option you pick.`;
        }
    }

    applyModuleAvailabilityToChoice(internalButton, hasInternal);
    applyModuleAvailabilityToChoice(externalButton, hasExternal);
}

async function openGameLaunchModal(gameName, availability) {
    updateGameLaunchModal(gameName, availability);
    await openModal("game-launch-modal");

    return new Promise((resolve) => {
        activeGameLaunchResolver = resolve;
    });
}

function submitGameLaunchChoice(choice) {
    const internalButton = document.getElementById("game-launch-internal");
    const externalButton = document.getElementById("game-launch-external");

    if (choice === "internal" && internalButton?.disabled) {
        return;
    }

    if (choice === "external" && externalButton?.disabled) {
        return;
    }

    const resolver = activeGameLaunchResolver;
    activeGameLaunchResolver = null;
    closeModal("game-launch-modal");

    if (resolver) {
        resolver(choice);
    }
}

window.submitGameLaunchChoice = submitGameLaunchChoice;

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

    if (window.api?.setAuthWindow) {
        window.api.setAuthWindow();
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

function escapeHtml(value = "") {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatDiscordMarkup(value = "") {
    let html = escapeHtml(String(value || "").replace(/\r\n/g, "\n"));
    const placeholders = [];
    const stash = (markup) => {
        const token = `%%DISCORD_MD_${placeholders.length}%%`;
        placeholders.push(markup);
        return token;
    };

    html = html.replace(/`([^`\n]+)`/g, (_, code) => stash(`<code class="discord-md-code">${code}</code>`));
    html = html.replace(/\*\*\*([\s\S]+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/___([\s\S]+?)___/g, '<span class="discord-md-underline"><em>$1</em></span>');
    html = html.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([\s\S]+?)__/g, '<span class="discord-md-underline">$1</span>');
    html = html.replace(/~~([\s\S]+?)~~/g, '<s>$1</s>');
    html = html.replace(/(^|[^*])\*([^*\n][\s\S]*?)\*(?!\*)/g, '$1<em>$2</em>');
    html = html.replace(/(^|[^_])_([^_\n][\s\S]*?)_(?!_)/g, '$1<em>$2</em>');
    html = html.replace(/\n/g, '<br>');

    return placeholders.reduce(
        (output, markup, index) => output.replace(`%%DISCORD_MD_${index}%%`, markup),
        html
    );
}

function setElementContent(element, value = "", { discordMarkup = false } = {}) {
    if (!element) {
        return;
    }

    if (discordMarkup) {
        element.innerHTML = formatDiscordMarkup(value);
        return;
    }

    element.textContent = value;
}

function showAppDialog(options = {}) {
    const {
        title = "Notification",
        message = "",
        detail = "",
        tone = "info",
        kicker = "SYSTEM NOTICE",
        renderDiscordMarkup = false,
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
    setElementContent(titleEl, title, { discordMarkup: renderDiscordMarkup });
    setElementContent(messageEl, message, { discordMarkup: renderDiscordMarkup });
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

function getToastStack() {
    let stack = document.getElementById('toast-stack');

    if (!stack) {
        stack = document.createElement('div');
        stack.id = 'toast-stack';
        stack.className = 'toast-stack';
        document.body.appendChild(stack);
    }

    return stack;
}

function formatAnnouncementTimestamp(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "LIVE NOW";
    }

    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    }).toUpperCase();
}

function isRecentAnnouncement(value, maxAgeMinutes = 15) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return false;
    }

    return (Date.now() - date.getTime()) <= maxAgeMinutes * 60 * 1000;
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
        machineIdCache = null;
        machineIdPromise = null;
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
                machineIdCache = snapshot?.machineId || machineIdCache;
                return snapshot;
            })
            .catch((err) => {
                hardwareSnapshotPromise = null;
                throw err;
            });
    }

    return hardwareSnapshotPromise;
}

async function loadMachineId(forceRefresh = false) {
    if (forceRefresh) {
        machineIdCache = null;
        machineIdPromise = null;
    }

    if (machineIdCache) {
        return machineIdCache;
    }

    if (hardwareSnapshot?.machineId && !forceRefresh) {
        machineIdCache = hardwareSnapshot.machineId;
        return machineIdCache;
    }

    if (!machineIdPromise) {
        machineIdPromise = Promise.resolve()
            .then(() => {
                if (window.api?.getMachineID) {
                    return window.api.getMachineID(forceRefresh);
                }

                return loadHardwareSnapshot(forceRefresh).then((snapshot) => snapshot.machineId);
            })
            .then((machineId) => {
                machineIdCache = machineId || "UNKNOWN";
                return machineIdCache;
            })
            .catch((err) => {
                machineIdPromise = null;
                throw err;
            })
            .finally(() => {
                machineIdPromise = null;
            });
    }

    return machineIdPromise;
}

function queueLoaderAuthNotice(message) {
    if (!message) {
        sessionStorage.removeItem('loader_auth_notice');
        return;
    }

    sessionStorage.setItem('loader_auth_notice', message);
}

function consumeLoaderAuthNotice() {
    const message = sessionStorage.getItem('loader_auth_notice');
    if (message) {
        sessionStorage.removeItem('loader_auth_notice');
    }
    return message;
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

function isSubscriptionExpired(expiryDate = localStorage.getItem('expiry_date')) {
    if (!expiryDate || expiryDate === "null") {
        return false;
    }

    const expiryTime = new Date(expiryDate).getTime();
    if (Number.isNaN(expiryTime)) {
        return false;
    }

    return Date.now() >= expiryTime;
}

function hasExpiredTabLock() {
    return Boolean(localStorage.getItem('license_key')) && isSubscriptionExpired();
}

function updateProtectedTabLocks() {
    const lockActive = hasExpiredTabLock();
    const tabButtonMap = {
        home: 'btn-home',
        games: 'btn-games',
        hwid: 'btn-hwid',
        spoofing: 'btn-spoofing',
        settings: 'btn-settings'
    };

    Object.entries(tabButtonMap).forEach(([tabName, elementId]) => {
        const button = document.getElementById(elementId);
        if (!button) {
            return;
        }

        const isLocked = lockActive && expiryLockedTabs.has(tabName);
        button.classList.toggle('is-locked', isLocked);
        button.setAttribute(
            'title',
            isLocked
                ? 'Subscription expired. Redeem a new key to unlock this section.'
                : ''
        );
    });
}

function dismissExpiryLockModal() {
    closeModal('expiry-modal');
    updateProtectedTabLocks();
    showTab('home', { bypassExpiryLock: true, silent: true });
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
            color: "var(--gold)",
            glow: "0 0 14px rgba(255, 208, 79, 0.35)"
        };
    }

    if (!expiry || expiry === "null") {
        return {
            label: "PENDING",
            detail: "No active subscription timer detected yet.",
            color: "var(--text-secondary)",
            glow: "none"
        };
    }

    const expiryDate = new Date(expiry);
    const expiryTime = expiryDate.getTime();

    if (Number.isNaN(expiryTime)) {
        return {
            label: "PENDING",
            detail: "Subscription timing data is unavailable.",
            color: "var(--text-secondary)",
            glow: "none"
        };
    }

    const diff = expiryTime - Date.now();

    if (diff <= 0) {
        return {
            label: "EXPIRED",
            detail: `Expired on ${expiryDate.toLocaleString()}`,
            color: "var(--red)",
            glow: "0 0 16px rgba(255, 84, 84, 0.32)"
        };
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    if (days >= 1) {
        let color = "#63f3b1";
        let glow = "0 0 16px rgba(99, 243, 177, 0.35)";

        if (days <= 10) {
            color = "var(--red)";
            glow = "0 0 16px rgba(255, 84, 84, 0.32)";
        } else if (days <= 30) {
            color = "#ffd54f";
            glow = "0 0 16px rgba(255, 213, 79, 0.30)";
        }

        return {
            label: `${days} DAY${days === 1 ? "" : "S"}`,
            detail: `Expires on ${expiryDate.toLocaleString()}`,
            color,
            glow
        };
    }

    const color = hours <= 10 ? "var(--red)" : "#ffd54f";
    const glow = hours <= 10
        ? "0 0 16px rgba(255, 84, 84, 0.32)"
        : "0 0 16px rgba(255, 213, 79, 0.30)";

    return {
        label: `${hours}h ${minutes}m ${seconds}s`,
        detail: `Less than 24 hours remain. Ends ${expiryDate.toLocaleTimeString()}.`,
        color,
        glow
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
            appendTerminalLine(line, {
                animate: index === lines.length - 1
            });
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

function scheduleDeferredStartupTask(callback, delay = 0) {
    window.requestAnimationFrame(() => {
        window.setTimeout(() => {
            Promise.resolve()
                .then(callback)
                .catch((error) => {
                    console.error("[STARTUP TASK ERROR]", error);
                });
        }, delay);
    });
}

let deferredStartupScheduled = false;

function scheduleDeferredStartupWork() {
    if (deferredStartupScheduled) {
        return;
    }

    deferredStartupScheduled = true;

    scheduleDeferredStartupTask(async () => {
        await syncInstalledVersion();

        if (localStorage.getItem('auto-update-loader') === 'true') {
            await checkForUpdates();
        }
    }, 80);

    scheduleDeferredStartupTask(() => loadHardwareSnapshot().catch(console.error), 1600);
    scheduleDeferredStartupTask(() => checkServer().catch(console.error), 280);
    scheduleDeferredStartupTask(() => refreshGameCardsForAvailability(getCurrentPrefix()).catch(console.error), 420);
    scheduleDeferredStartupTask(async () => {
        await refreshGameCardFeeds();
        startGameFeedRefreshLoop();
    }, 560);
    scheduleDeferredStartupTask(() => startDiscordAnnouncementPolling(), 720);
}

async function initializeLoader() {
    const el = (id) => document.getElementById(id);
    const queuedNotice = consumeLoaderAuthNotice();

    applyProfileImage(getStoredProfileImage(), { persist: false });

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

    showManualLoginState(queuedNotice || "No valid session found. Please log in manually.");
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.body.classList.contains('login-active') && window.api?.setAuthWindow) {
        window.api.setAuthWindow();
    }

    hoistModalToBody('register-modal');
    hoistModalToBody('auto-login-modal');
    hoistModalToBody('game-launch-modal');
    hoistModalToBody('external-link-modal');
    hoistModalToBody('app-dialog-modal');
    initializeLoaderTheme();
    updateVersionLabels();
    void initializeLoader();
    scheduleDeferredStartupWork();
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
    const gameConfig = getGameModuleConfig(gameName);

    if (!hasAccess(gameName)) return;

    const key = localStorage.getItem('license_key');
    if (!key) {
        await showErrorDialog("License Required", "Redeem a license key from your profile before launching a game.");
        openModal('settings-modal');
        return;
    }

    const autoCloseActive = document.getElementById('auto-close-launcher').checked;

    const injectionModal = document.getElementById('injection-modal');
    const moduleAvailability = await getGameModuleAvailability(gameName);
    const injectionType = await openGameLaunchModal(gameName, moduleAvailability);

    if (injectionType === 'cancel') {
        addTerminalLine(`> [SYSTEM] ${gameConfig.displayName.toUpperCase()} launch cancelled.`);
        return;
    }

    // --- START INJECTION OVERLAY ---
    if (injectionModal) {
        resetInjectionProgressUI();
        injectionModal.classList.remove('hidden');
        startInjectionProgressAnimation(gameConfig.displayName);
    }

    addTerminalLine(`> [MODULE] ${gameConfig.displayName.toUpperCase()} -> ${injectionType.toUpperCase()} selected.`);
    addTerminalLine(`> [SYSTEM] Initializing ${gameConfig.displayName.toUpperCase()}...`);

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
    const result = await window.api.launchCheat(gameConfig.displayName, autoCloseActive, key, injectionType, userData);

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
        "> theme custom, theme reset",
        "> Natural language works too: turn off rich, keep launcher open, go home"
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

function commandIncludesAny(command, phrases = []) {
    return phrases.some((phrase) => command.includes(phrase));
}

function getExplicitToggleIntent(command) {
    if (commandIncludesAny(command, ['turn on', 'switch on', 'enable', 'start ', 'activate'])) {
        return true;
    }

    if (commandIncludesAny(command, ['turn off', 'switch off', 'disable', 'stop ', 'deactivate'])) {
        return false;
    }

    return null;
}

function getTerminalToggleTarget(command) {
    const targets = [
        {
            id: 'discord-rpc',
            keywords: ['rich presence', 'discord rich presence', 'discord rich', 'discord rpc', 'rich', 'rpc', 'presence', 'discord status']
        },
        {
            id: 'stream-proof',
            keywords: ['stream proof', 'streamproof', 'stream mode', 'hide from stream', 'hide on stream', 'streaming protection']
        },
        {
            id: 'auto-close-launcher',
            keywords: ['auto close', 'close launcher', 'close after inject', 'exit after inject', 'quit after inject', 'stay open', 'keep open', 'leave open', 'launcher open']
        },
        {
            id: 'auto-update-loader',
            keywords: ['auto update', 'automatic update', 'auto updates', 'update automatically', 'updates', 'launcher updates']
        },
        {
            id: 'auto-launch',
            keywords: ['auto launch', 'launch on startup', 'start on startup', 'start with windows', 'open on startup', 'startup']
        }
    ];

    return targets.find((target) => commandIncludesAny(command, target.keywords)) || null;
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

    const target = getTerminalToggleTarget(command);
    if (!target) {
        return null;
    }

    const explicitValue = getExplicitToggleIntent(command);
    if (explicitValue !== null) {
        return {
            id: target.id,
            value: explicitValue
        };
    }

    if (target.id === 'auto-close-launcher') {
        if (commandIncludesAny(command, ['stay open', 'keep open', 'leave open', "don't close", 'do not close'])) {
            return { id: target.id, value: false };
        }

        if (commandIncludesAny(command, ['close after inject', 'exit after inject', 'quit after inject'])) {
            return { id: target.id, value: true };
        }
    }

    if (target.id === 'stream-proof' && commandIncludesAny(command, ['hide from stream', 'hide on stream', 'stream mode'])) {
        return { id: target.id, value: true };
    }

    if (target.id === 'auto-launch' && commandIncludesAny(command, ['start with windows', 'launch on startup', 'start on startup', 'open on startup'])) {
        return { id: target.id, value: true };
    }

    if (target.id === 'discord-rpc') {
        if (commandIncludesAny(command, ['no rich presence', 'without rich presence', 'without rpc'])) {
            return { id: target.id, value: false };
        }

        if (commandIncludesAny(command, ['show rich presence', 'use rich presence'])) {
            return { id: target.id, value: true };
        }
    }

    if (commandIncludesAny(command, ['toggle ', 'flip '])) {
        return {
            id: target.id,
            value: !Boolean(document.getElementById(target.id)?.checked)
        };
    }

    return null;
}

function parseTerminalNavigationCommand(command) {
    const navigationTargets = [
        { tab: 'home', keywords: ['home', 'dashboard', 'main screen'] },
        { tab: 'games', keywords: ['games', 'game tab', 'game menu', 'modules'] },
        { tab: 'hwid', keywords: ['hwid', 'hardware', 'machine id'] },
        { tab: 'spoofing', keywords: ['spoofing', 'spoofer', 'spoof'] },
        { tab: 'settings', keywords: ['settings', 'setting tab', 'config', 'configuration'] }
    ];

    for (const target of navigationTargets) {
        if (command === target.tab) {
            return target.tab;
        }

        if (
            commandIncludesAny(command, target.keywords) &&
            commandIncludesAny(command, ['go ', 'open ', 'show ', 'switch ', 'take me', 'bring me'])
        ) {
            return target.tab;
        }
    }

    return null;
}

function parseTerminalExternalCommand(command) {
    const externalTargets = [
        { key: 'discord', keywords: ['discord', 'server'], exact: ['discord', 'open discord', 'join discord'] },
        { key: 'support', keywords: ['support', 'shop', 'store'], exact: ['support', 'shop', 'open support', 'open shop', 'shop support'] },
        { key: 'github', keywords: ['github', 'repo', 'repository'], exact: ['github', 'open github'] }
    ];

    for (const target of externalTargets) {
        if (target.exact.includes(command)) {
            return target.key;
        }

        if (command === target.key) {
            return target.key;
        }

        if (
            commandIncludesAny(command, target.keywords) &&
            commandIncludesAny(command, ['open ', 'join ', 'visit ', 'launch ', 'show '])
        ) {
            return target.key;
        }
    }

    return null;
}

function parseThemeCommand(command) {
    if (command === 'theme custom' || commandIncludesAny(command, ['apply custom theme', 'use custom theme'])) {
        return { type: 'custom' };
    }

    if (command === 'theme reset' || commandIncludesAny(command, ['reset theme', 'restore default theme'])) {
        return { type: 'reset' };
    }

    for (const preset of Object.keys(themePresets)) {
        if (
            command === `theme ${preset}` ||
            command === `${preset} theme` ||
            command === `use ${preset}` ||
            command === `apply ${preset}` ||
            command.includes(`theme ${preset}`) ||
            command.includes(`theme to ${preset}`) ||
            command.includes(`${preset} theme`)
        ) {
            return { type: 'preset', preset };
        }
    }

    return null;
}

function isRefreshCommand(command) {
    return [
        'refresh',
        'refresh feed',
        'refresh terminal',
        'reload terminal',
        'reload feed',
        'refresh news',
        'news',
        'sync terminal'
    ].includes(command);
}

function isUpdateCheckCommand(command) {
    return [
        'update',
        'check update',
        'check updates',
        'check for updates',
        'scan for updates',
        'look for updates',
        'search for updates'
    ].includes(command);
}

function isResetCommand(command) {
    return [
        'reset',
        'reset settings',
        'factory reset',
        'reset config',
        'wipe settings'
    ].includes(command);
}

function isStatusCommand(command) {
    return command === 'status' || command === 'show status' || command === 'system status' || command === 'loader status';
}

async function runTerminalCommand(rawCommand) {
    const command = rawCommand.trim().replace(/\s+/g, ' ').toLowerCase();
    if (!command) {
        return;
    }

    addTerminalLine(`VEX-USER:~$ ${rawCommand.trim()}`);

    if (command === 'clear' || command === 'cls') {
        clearLogs();
        return;
    }

    if (command === 'help') {
        showTerminalCommandHelp();
        return;
    }

    if (isStatusCommand(command)) {
        showSystemStatus();
        return;
    }

    if (isRefreshCommand(command)) {
        newsLoaded = false;
        await loadNews(true);
        addTerminalLine("> [FEED] Terminal refreshed.");
        return;
    }

    if (isUpdateCheckCommand(command)) {
        await runManualUpdateCheck();
        return;
    }

    if (isResetCommand(command)) {
        await resetConfig();
        return;
    }

    const navigationTarget = parseTerminalNavigationCommand(command);
    if (navigationTarget) {
        showTab(navigationTarget);
        addTerminalLine(`> [NAV] Switched to ${navigationTarget.toUpperCase()}.`);
        return;
    }

    const themeCommand = parseThemeCommand(command);
    if (themeCommand?.type === 'custom') {
        applyCustomThemeFromInputs();
        return;
    }

    if (themeCommand?.type === 'reset') {
        resetCustomTheme();
        return;
    }

    if (themeCommand?.type === 'preset') {
        setLoaderTheme(themeCommand.preset);
        return;
    }

    const toggleCommand = parseSettingToggleCommand(command);
    if (toggleCommand) {
        applySettingValue(toggleCommand.id, toggleCommand.value);
        return;
    }

    const externalTarget = parseTerminalExternalCommand(command);
    if (externalTarget) {
        showExternalActionModal(externalTarget);
        return;
    }

    addTerminalLine(`> Unknown command: ${command}`);
    addTerminalLine("> Type HELP for the available client controls.");
}

function isRealProfileImage(value) {
    const candidate = String(value || '').trim();
    if (!candidate) {
        return false;
    }

    return !/^\.?\/?imgs\/default-(?:avatar|profile)\.png$/i.test(candidate);
}

function getStoredProfileImage() {
    const savedProfilePic = localStorage.getItem('saved_profile_pic');
    if (isRealProfileImage(savedProfilePic)) {
        return savedProfilePic;
    }

    const legacyProfilePic = localStorage.getItem('profilePic');
    if (isRealProfileImage(legacyProfilePic)) {
        return legacyProfilePic;
    }

    return "imgs/default-profile.png";
}

function applyProfileImage(imageValue, options = {}) {
    const { persist = true } = options;
    const resolvedImage = isRealProfileImage(imageValue)
        ? imageValue
        : getStoredProfileImage();

    if (persist) {
        localStorage.setItem('saved_profile_pic', resolvedImage);
        localStorage.setItem('profilePic', resolvedImage);
    }

    ['user-pic', 'modal-pfp', 'profile-pic'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
            el.src = resolvedImage;
        }
    });
}

// Function to force-apply the PFP to all relevant elements
function syncProfileImage() {
    applyProfileImage(getStoredProfileImage(), { persist: false });
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
                let profilePicData = event.target.result;

                if (profilePicData?.startsWith('data:image')) {
                    profilePicData = await compressImage(profilePicData);
                }

                // Save locally first for instant feedback
                applyProfileImage(profilePicData);

                try {
                    const userEmail = localStorage.getItem('user_email');
                    const cleanAPI = API.endsWith('/') ? API.slice(0, -1) : API;

                    if (!userEmail) {
                        return;
                    }

                    const res = await fetch(`${cleanAPI}/update-profile`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            user_id_email: userEmail.toLowerCase(),
                            profile_pic: profilePicData
                        })
                    });

                    const data = await res.json();

                    if (res.ok && data.success) {
                        console.log("✅ Profile pic synced to Render DB");
                        applyProfileImage(data.profile_pic || profilePicData);
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
        if (avatarEl) avatarEl.src = getStoredProfileImage();
    }
}

function showTab(tabName, options = {}) {
    const { bypassExpiryLock = false, silent = false } = options;

    if (!bypassExpiryLock && hasExpiredTabLock() && expiryLockedTabs.has(tabName)) {
        refreshExpiryModal(localStorage.getItem('expiry_date'));
        openModal('expiry-modal');
        if (!silent) {
            addTerminalLine(`> [ACCESS] ${tabName.toUpperCase()} is locked until a fresh key is redeemed.`);
        }
        return;
    }

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

    updateProtectedTabLocks();
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
        const hwid = await loadMachineId();

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

            setSessionAccess(data.license_key || '');

            // ---------- PROFILE ----------
            const profilePic = isRealProfileImage(data.profile_pic)
                ? data.profile_pic
                : getStoredProfileImage();
            applyProfileImage(profilePic);

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

            if (window.api?.setAppWindow) {
                window.api.setAppWindow();
            }

            expirySequenceTriggered = false;
            updateSubscriptionStatus(data.expiry);
            startExpiryHeartbeat(data.expiry);
            updateUIForAccess();

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
        homeExp.style.textShadow = expirySnapshot.glow || "none";
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
            liveExp.style.textShadow = liveSnapshot.glow || "none";
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

    btn.innerHTML = `<div class="spinner"></div> CREATING...`;
    btn.disabled = true;

    try {
        const hwid = await loadMachineId();

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
            await showErrorDialog("Registration Failed", data.message || "Email is invalid or disposable.");
        } else {
            await showErrorDialog("Registration Failed", data.message || data.error || "Unknown error");
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
    document.querySelectorAll('.launch-btn').forEach((btn) => {
        btn.disabled = false;
    });

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
    const config = getGameModuleConfig(gameName);
    const prefix = currentUserPrefix || localStorage.getItem('user_prefix');

    if (prefix === "ALLX") return true;

    if (prefix === config.prefix) {
        return true;
    }

    void showErrorDialog("Access Denied", `Your current key (${prefix}) is not valid for ${config.displayName}.`);
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
    const config = getGameModuleConfig(gameName);
    const prefix = currentUserPrefix || localStorage.getItem('user_prefix');
    if (prefix === "ALLX") return true;

    return config.prefix === prefix;
}

async function refreshGameCardsForAvailability(currentPrefix = getCurrentPrefix()) {
    const cards = Array.from(document.querySelectorAll('.game-card[data-game]'));
    const subscriptionExpired = isSubscriptionExpired();

    await Promise.all(cards.map(async (card) => {
        const gameName = card.dataset.game || "";
        const config = getGameModuleConfig(gameName);
        const hasModuleAccess = !subscriptionExpired && ((currentPrefix === "ALLX") || hasAccessQuietly(gameName));
        const availability = await getGameModuleAvailability(gameName);
        const hasInternal = Boolean(availability?.hasInternal);
        const hasExternal = Boolean(availability?.hasExternal);
        let accessState = "locked";

        if (hasModuleAccess && hasInternal && hasExternal) {
            accessState = "ready";
        } else if (hasModuleAccess && (hasInternal || hasExternal)) {
            accessState = "partial";
        } else if (hasModuleAccess) {
            accessState = "pending";
        }

        card.dataset.access = accessState;
        card.classList.toggle('locked', !hasModuleAccess);

        const stateLabel = card.querySelector('[data-game-state]');
        if (stateLabel) {
            stateLabel.textContent = accessState === "ready"
                ? "READY"
                : accessState === "partial"
                    ? "PARTIAL"
                    : accessState === "pending"
                        ? "PENDING"
                        : "LOCKED";
        }

        const accessPill = card.querySelector('[data-game-access-pill]');
        if (accessPill) {
            accessPill.textContent = hasModuleAccess
                ? accessState === "ready"
                    ? "Modules Ready"
                    : accessState === "partial"
                        ? "Partial Build"
                        : "Awaiting Assets"
                : `Requires ${config.prefix}`;
        }

        card.querySelectorAll('[data-module-type]').forEach((pill) => {
            const isInternal = pill.dataset.moduleType === "internal";
            const isReady = isInternal ? hasInternal : hasExternal;
            pill.classList.toggle('is-ready', isReady);
            pill.classList.toggle('is-missing', !isReady);
        });

        if (currentPrefix === "ALLX") {
            card.style.boxShadow = "0 0 10px rgba(255, 215, 0, 0.2)";
            card.style.borderColor = "var(--gold)";
        } else {
            card.style.removeProperty("box-shadow");
            card.style.removeProperty("border-color");
        }
    }));
}

function updateUIForAccess() {

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

    if (expiry) {
        updateSubscriptionStatus(expiry);
    }

    void refreshGameCardsForAvailability(currentPrefix);
    updateProtectedTabLocks();

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

    syncHwidRequestBadge();
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
        const hwid = await loadMachineId();
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
            expirySequenceTriggered = false;
            closeModal('expiry-modal');
            updateSubscriptionStatus(data.new_expiry);
            if (typeof startExpiryHeartbeat === 'function') startExpiryHeartbeat(data.new_expiry);
            if (typeof updateUIForAccess === 'function') updateUIForAccess();
            updateProtectedTabLocks();

            closeModal('settings-modal');
            showTab('home', { bypassExpiryLock: true, silent: true });
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
    } else if (id === 'game-launch-modal') {
        activeGameLaunchResolver = null;
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
                applyProfileImage(profilePicData);
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

function deriveHwidTicketNumber(requestId) {
    const cleanId = String(requestId || '').replace(/[^a-fA-F0-9]/g, '');
    if (!cleanId) {
        return null;
    }

    const tail = cleanId.slice(-6);
    const numeric = Number.parseInt(tail, 16);

    if (!Number.isFinite(numeric)) {
        return null;
    }

    return (numeric % 9000) + 1000;
}

function formatHwidRequestBadge(ticketNumber, requestId = "") {
    const normalized = Number(ticketNumber);
    if (Number.isFinite(normalized) && normalized > 0) {
        return `#${String(normalized).padStart(4, '0')}`;
    }

    const derived = deriveHwidTicketNumber(requestId);
    return derived ? `#${String(derived).padStart(4, '0')}` : '#----';
}

function syncHwidRequestBadge() {
    const badge = document.getElementById('hwid-request-badge');
    if (!badge) {
        return;
    }

    const label = formatHwidRequestBadge(latestHwidResetTicketNumber, latestHwidResetRequestId);
    badge.textContent = label;
    badge.classList.toggle('is-empty', label === '#----');
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

    const applyState = (statusText, statusClass, requestState, requestStateClass, resetText, resetDisabled, requestText, requestDisabled, note) => {
        if (statusEl) {
            statusEl.textContent = statusText;
            statusEl.className = statusClass;
        }

        if (requestStateEl) {
            requestStateEl.textContent = requestState;
            requestStateEl.className = requestStateClass || "";
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
                "processing",
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
                "active-status",
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
                "processing",
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
                "active-status",
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
                "inactive",
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
                "inactive",
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
                "",
                "WAITING FOR APPROVAL",
                true,
                "REQUEST HWID RESET",
                false,
                "Request approval from admin before the HWID reset can run."
            );
            break;
    }

    syncHwidRequestBadge();
}

async function fetchHwidResetStatus(savedKey) {
    const statusCheck = await fetch(`${API}/check-reset-status?key=${savedKey}`);
    return statusCheck.json();
}

function applyHwidResetStatus(statusData, logTransition = true) {
    const normalizedStatus = (statusData?.status || "NONE").toUpperCase();
    const requestId = statusData?.requestId || null;
    const ticketNumber = Number(statusData?.ticketNumber);
    const consumedRequestId = getConsumedHwidResetRequestId();
    const previousStatus = hwidResetApprovalStatus;

    if (requestId) {
        latestHwidResetRequestId = requestId;
    }

    if (Number.isFinite(ticketNumber) && ticketNumber > 0) {
        latestHwidResetTicketNumber = ticketNumber;
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

    if (!requestId) {
        latestHwidResetRequestId = null;
        latestHwidResetTicketNumber = null;
    }

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
            latestHwidResetTicketNumber = Number(data.ticketNumber) || latestHwidResetTicketNumber;
            clearConsumedHwidResetRequest();
            syncHwidRequestBadge();
            appendAdminRequestLog(data.message === "Request already pending." ? "REQUEST ALREADY PENDING." : "REQUEST SENT TO ADMIN.");
            appendAdminRequestLog(`REQUEST ID: ${formatHwidRequestBadge(latestHwidResetTicketNumber, latestHwidResetRequestId)}`);
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

    function setActiveTerminalLine(entry) {
        const box = document.getElementById('main-terminal');
        if (!box) return;

        box.querySelectorAll('.typewriter').forEach((line) => {
            line.classList.remove('typewriter');
        });

        if (entry) {
            entry.classList.add('typewriter');
        }
    }

    function appendTerminalLine(text, options = {}) {
        const box = document.getElementById('main-terminal');
        if (!box) return null;

        const { animate = true, reset = false } = options;

        if (reset) {
            box.innerHTML = "";
        }

        const line = document.createElement('div');
        line.className = 'terminal-line';
        line.innerText = text;
        box.appendChild(line);
        if (animate) {
            setActiveTerminalLine(line);
        }
        box.scrollTop = box.scrollHeight;
        return line;
    }

    function addTerminalLine(text) {
        appendTerminalLine(text, { animate: true });
    }

    // --- SETTINGS ACTIONS ---
    function clearLogs() {
        const terminal = document.getElementById('main-terminal');
        if (terminal) {
            appendTerminalLine("> [SYSTEM] Logs cleared. Awaiting fresh terminal feed...", {
                reset: true,
                animate: true
            });
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

        queueLoaderAuthNotice("No valid session found. Please log in manually.");

        if (window.api?.resetAuthShell) {
            window.api.resetAuthShell();
            return;
        }

        location.reload();
    }

    function refreshExpiryModal(expiryDate) {
        const badge = document.getElementById('expiry-modal-badge');
        const title = document.getElementById('expiry-modal-title');
        const detail = document.getElementById('expiry-modal-detail');
        const countdown = document.getElementById('expiry-modal-countdown');
        const accessCopy = document.getElementById('expiry-modal-access');

        const expiryTime = new Date(expiryDate).getTime();
        const remainingMs = Number.isNaN(expiryTime) ? 0 : Math.max(0, expiryTime - Date.now());
        const totalSeconds = Math.floor(remainingMs / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const countdownLabel = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

        if (badge) {
            badge.textContent = remainingMs > 0 ? "RENEWAL WARNING" : "SUBSCRIPTION EXPIRED";
        }

        if (title) {
            title.textContent = remainingMs > 0 ? "VEXION ACCESS ENDING" : "VEXION ACCESS EXPIRED";
        }

        if (detail) {
            detail.textContent = remainingMs > 0
                ? `Your current session ends on ${new Date(expiryDate).toLocaleString()}. Redeem a fresh key or renew before the timer reaches zero.`
                : "Your VEXION session has ended. Renew your plan or redeem a fresh key to restore module access.";
        }

        if (countdown) {
            countdown.textContent = countdownLabel;
        }

        if (accessCopy) {
            accessCopy.innerHTML = remainingMs > 0
                ? `Modules stay active until the timer reaches <span style="color: #ffd54f;">00:00:00</span>.`
                : `All module actions are now <span style="color: var(--red);">locked</span> until you renew.`;
        }
    }

    async function notifyExpiryExpiration() {
        if (!window.api?.showSystemNotification) {
            return;
        }

        try {
            await window.api.showSystemNotification(
                "VEXION Subscription Expired",
                "Your access has ended. Redeem a new key or renew your plan to restore module access."
            );
        } catch (error) {
            console.warn("[EXPIRY NOTIFICATION ERROR]", error);
        }
    }

    function startExpiryHeartbeat(expiryDate) {
        if (expiryCheckInterval) clearInterval(expiryCheckInterval);

        const expiryTime = new Date(expiryDate).getTime();

        if (!expiryDate || Number.isNaN(expiryTime)) {
            return;
        }

        expirySequenceTriggered = false;
        refreshExpiryModal(expiryDate);

        const tick = () => {
            refreshExpiryModal(expiryDate);
            updateSubscriptionStatus(expiryDate);

            if (Date.now() >= expiryTime) {
                console.log("[SECURITY] License Expired during runtime.");
                clearInterval(expiryCheckInterval);
                triggerExpirySequence(expiryDate);
            }
        };

        tick();
        expiryCheckInterval = setInterval(tick, 1000);
    }

function triggerExpirySequence(expiryDate = localStorage.getItem('expiry_date')) {
    if (expirySequenceTriggered) {
        refreshExpiryModal(expiryDate);
        openModal('expiry-modal');
        return;
        }

        expirySequenceTriggered = true;
    refreshExpiryModal(expiryDate);
    updateSubscriptionStatus(expiryDate);
    updateUIForAccess();
    updateProtectedTabLocks();
    closeModal('settings-modal');
    closeModal('game-launch-modal');
    closeModal('external-link-modal');
    showTab('home', { bypassExpiryLock: true, silent: true });
    openModal('expiry-modal');
    void notifyExpiryExpiration();
}

    function openExpiryRenewalSupport() {
        closeModal('expiry-modal');
        openShop();
    }

    function openExpiryRedeemFlow() {
        closeModal('expiry-modal');
        openModal('settings-modal');
    }

function forceLogout() {
        stopHwidResetPolling();
        closeModal('expiry-modal');
        expirySequenceTriggered = false;
        localStorage.removeItem('user_email');
        localStorage.removeItem('license_key');
        localStorage.removeItem('expiry_date');
        localStorage.removeItem('remembered_password');
        localStorage.removeItem('remembered-password');
        localStorage.setItem('remember-me', 'false');

        const infoEmail = document.getElementById('info-email');
        const infoHwid = document.getElementById('info-hwid');
        const manageStatus = document.getElementById('manage-status');

        if (infoEmail) infoEmail.innerText = "---";
        if (infoHwid) {
            infoHwid.innerText = "PENDING_HWID";
            infoHwid.style.color = "#607d8b";
            infoHwid.style.textShadow = "none";
        }
        if (manageStatus) {
            manageStatus.innerText = "Offline";
            manageStatus.style.color = "var(--red)";
        }

        if (typeof expiryCheckInterval !== 'undefined' && expiryCheckInterval) {
            clearInterval(expiryCheckInterval);
            expiryCheckInterval = null;
        }

    if (window.api && window.api.toggleDiscord) {
        window.api.toggleDiscord(false);
    }

    queueLoaderAuthNotice("Your VEXION session ended. Renew or redeem a new key to continue.");

    if (window.api?.resetAuthShell) {
        window.api.resetAuthShell();
        return;
    }

    showManualLoginState("Your VEXION session ended. Renew or redeem a new key to continue.");
    updateUIForAccess();
    updateProtectedTabLocks();
    console.log("> [AUTH] Session terminated. Returning to login...");
}

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
        createToast(
            "Update Available!",
            "Click here to open the update modal.",
            () => document.getElementById("update-modal").classList.toggle("hidden")
        );
    }

function createToast(title, message, onClick, options = {}) {
    const stack = getToastStack();
    const toast = document.createElement("div");
    const titleEl = document.createElement("strong");
    const messageEl = document.createElement("p");
    const metaEl = options.meta ? document.createElement("span") : null;

    toast.classList.add("toast-notification");
    titleEl.className = "toast-title";
    messageEl.className = "toast-message";

    if (options.variant) {
        toast.classList.add(`is-${options.variant}`);
    }

    setElementContent(titleEl, title, { discordMarkup: Boolean(options.renderDiscordMarkup) });
    setElementContent(messageEl, message, { discordMarkup: Boolean(options.renderDiscordMarkup) });
    toast.appendChild(titleEl);
    toast.appendChild(messageEl);

    if (metaEl) {
        metaEl.className = "toast-meta";
        metaEl.textContent = options.meta;
        toast.appendChild(metaEl);
    }

    toast.addEventListener("click", () => {
        if (onClick) onClick();
        toast.remove();
    });

    stack.appendChild(toast);
    setTimeout(() => toast.remove(), options.duration || 7000);
}

function showDiscordAnnouncementToast(announcement) {
    if (!announcement?.id) {
        return;
    }

    createToast(
        announcement.title || "New Admin Notice",
        announcement.detail || "A new admin notice was posted in Discord.",
        () => {
            void showAppDialog({
                title: announcement.title || "New Admin Notice",
                message: announcement.detail || "A new admin notice was posted in Discord.",
                detail: `${announcement.author || "Admin"} · ${formatAnnouncementTimestamp(announcement.timestamp)}`,
                tone: "info",
                kicker: "ADMIN ANNOUNCEMENT",
                renderDiscordMarkup: true,
                actions: [{ label: "OK", value: true, variant: "primary" }]
            });
        },
        {
            variant: "admin",
            duration: 10000,
            renderDiscordMarkup: true,
            meta: `${announcement.author || "ADMIN"} · ${formatAnnouncementTimestamp(announcement.timestamp)}`
        }
    );
}

async function pollDiscordAnnouncements({ silentBaseline = false } = {}) {
    try {
        const response = await fetch(`${API}/loader-notification/latest`, {
            cache: 'no-store'
        });

        if (!response.ok) {
            return;
        }

        const data = await response.json();
        const announcement = data?.announcement;

        if (!data?.enabled || !announcement?.id) {
            return;
        }

        if (!latestDiscordAnnouncementId) {
            latestDiscordAnnouncementId = announcement.id;
            localStorage.setItem('last_seen_discord_loader_notification_id', announcement.id);

            if (!silentBaseline || isRecentAnnouncement(announcement.timestamp)) {
                showDiscordAnnouncementToast(announcement);
            }
            return;
        }

        if (latestDiscordAnnouncementId !== announcement.id) {
            latestDiscordAnnouncementId = announcement.id;
            localStorage.setItem('last_seen_discord_loader_notification_id', announcement.id);
            showDiscordAnnouncementToast(announcement);
        }
    } catch (error) {
        console.warn("[DISCORD ANNOUNCEMENT POLL ERROR]", error);
    }
}

function startDiscordAnnouncementPolling() {
    if (discordAnnouncementPollInterval) {
        clearInterval(discordAnnouncementPollInterval);
    }

    void pollDiscordAnnouncements({ silentBaseline: true });
    discordAnnouncementPollInterval = setInterval(() => {
        void pollDiscordAnnouncements();
    }, 30000);
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
