const crypto = require('crypto');
const nacl = require('tweetnacl');
const { ObjectId } = require('mongodb');

const GUILD_ID = process.env.GUILD_ID || '1244947057320661043';
const ADMIN_USER_ID = process.env.ADMIN_USER_ID || '1280926025789870209';
const PANEL_CHANNEL_ID = process.env.PANEL_CHANNEL_ID || '1469005198700712046';
const HWID_RESET_CHANNEL_ID = process.env.HWID_RESET_CHANNEL_ID || '1403918366623797268';
const LOADER_ALERT_CHANNEL_ID = process.env.DISCORD_LOADER_ALERT_CHANNEL_ID || '1373760247658971256';
const STORE_URL = process.env.STORE_URL || 'https://whosthesource.mysellauth.com';
const APPLICATION_ID = process.env.DISCORD_APPLICATION_ID || process.env.APPLICATION_ID || process.env.CLIENT_ID || '1476724607485743277';
const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY || '';

const PRODUCT_CHOICES = ['CS2', 'FiveM', 'GTAV', 'Warzone', 'All-Access'];
const EPHEMERAL_FLAG = 64;

const discordBotState = {
    mode: 'interactions',
    initRequestedAt: null,
    tokenPresent: false,
    publicKeyPresent: false,
    commandsSyncedAt: null,
    panelsRefreshedAt: null,
    lastError: null,
    lastWarn: null,
    lastDebug: null,
    applicationId: APPLICATION_ID,
    guildId: GUILD_ID,
    panelChannelId: PANEL_CHANNEL_ID,
    hwidResetChannelId: HWID_RESET_CHANNEL_ID,
    loaderAlertChannelId: LOADER_ALERT_CHANNEL_ID,
    endpointConfigured: false
};

function normalizeGameName(value) {
    const cleaned = String(value || '').trim();
    const normalized = cleaned.toUpperCase();

    if (normalized === 'CS2' || normalized === 'COUNTER-STRIKE 2') return 'CS2';
    if (normalized === 'FIVEM' || normalized === 'FIVE M') return 'FiveM';
    if (normalized === 'GTAV' || normalized === 'GTA V' || normalized === 'GTA5') return 'GTAV';
    if (normalized === 'WARZONE' || normalized === 'COD') return 'Warzone';
    if (normalized === 'ALL-ACCESS' || normalized === 'ALL ACCESS' || normalized === 'ALLX') return 'All-Access';
    return cleaned || 'CS2';
}

function generateLicenseKey(gameName) {
    const gamePrefixMap = {
        CS2: 'CS2X',
        FiveM: 'FIVM',
        GTAV: 'GTAV',
        Warzone: 'WARZ',
        'All-Access': 'ALLX'
    };

    const prefix = gamePrefixMap[normalizeGameName(gameName)] || 'GENR';
    const randomPart = crypto.randomBytes(6).toString('hex').toUpperCase().match(/.{1,4}/g).join('-');
    return `${prefix}-${randomPart}`;
}

function buildPendingVoucherEmail(key) {
    return `pending_${String(key || '').toLowerCase()}`;
}

function isPendingVoucher(userDoc) {
    const email = String(userDoc?.email || '').toLowerCase();
    return email.startsWith('pending_');
}

function normalizeDate(dateValue) {
    if (!dateValue) return null;
    if (dateValue instanceof Date) return dateValue;
    if (dateValue.$date) return new Date(dateValue.$date);

    const candidate = new Date(dateValue);
    return Number.isNaN(candidate.getTime()) ? null : candidate;
}

function formatExpiry(expiryValue) {
    const expiry = normalizeDate(expiryValue);
    if (!expiry) return 'Not Set';
    return expiry.toISOString().replace('T', ' ').replace('.000Z', ' UTC');
}

function embedField(name, value, inline = false) {
    return { name, value, inline };
}

function buildStatusEmbed(user, discordUser) {
    const expiry = normalizeDate(user?.expiry_date);
    const now = new Date();
    const statusText = expiry
        ? (now < expiry ? 'Active' : 'Expired')
        : (isPendingVoucher(user) ? 'Pending Setup' : 'Active (No Expiry Set)');

    const games = Array.isArray(user?.games) && user.games.length > 0 ? user.games.join(', ') : 'General';
    const hwidStatus = user?.hwid ? 'Locked' : 'Not Set';
    const banStatus = user?.is_banned ? 'BANNED' : 'CLEAN';

    const fields = [
        embedField('License Key', `\`${user?.license_key || 'Not Set'}\``, false),
        embedField('Product', `\`${games}\``, true),
        embedField('Status', `\`${statusText}\``, true),
        embedField('Account', `\`${banStatus}\``, true),
        embedField('Expires', `\`${formatExpiry(expiry)}\``, false),
        embedField('HWID Status', `\`${hwidStatus}\``, true)
    ];

    if (isPendingVoucher(user)) {
        fields.push(embedField(
            'Voucher State',
            `\`Pending voucher\`\nReserved Email: \`${user?.reserved_email || 'No reserved email'}\``,
            false
        ));
    }

    return {
        title: 'Account Subscription Info',
        color: user?.is_banned ? 0x8B0000 : 0x22C55E,
        fields,
        footer: { text: `Discord ID: ${discordUser.id}` },
        thumbnail: discordUser?.avatar
            ? { url: `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=256` }
            : undefined
    };
}

function buildPanelComponents() {
    return [{
        type: 1,
        components: [
            { type: 2, custom_id: 'buy_license_btn', label: 'Buy License', style: 1 },
            { type: 2, custom_id: 'redeem_key_btn', label: 'Redeem Key', style: 3 }
        ]
    }];
}

function buildHwidResetComponents() {
    return [{
        type: 1,
        components: [
            { type: 2, custom_id: 'reset_hwid_btn', label: 'Reset HWID', style: 4 }
        ]
    }];
}

function buildResetActionRows(requests) {
    return requests.slice(0, 5).map(reqDoc => ({
        type: 1,
        components: [
            {
                type: 2,
                custom_id: `approve_reset:${reqDoc._id}`,
                label: `Approve ${String(reqDoc.license_key || '').slice(0, 10) || 'Request'}`,
                style: 3
            },
            {
                type: 2,
                custom_id: `deny_reset:${reqDoc._id}`,
                label: `Deny ${String(reqDoc.license_key || '').slice(0, 10) || 'Request'}`,
                style: 4
            }
        ]
    }));
}

function getCommandOption(interaction, optionName) {
    const options = interaction?.data?.options || [];
    const match = options.find(option => option.name === optionName);
    return match ? match.value : null;
}

function interactionMessageResponse({ content = '', embeds = [], components = [], ephemeral = true }) {
    return {
        type: 4,
        data: {
            content,
            embeds,
            components,
            flags: ephemeral ? EPHEMERAL_FLAG : undefined
        }
    };
}

function interactionModalResponse({ customId, title, label, placeholder }) {
    return {
        type: 9,
        data: {
            custom_id: customId,
            title,
            components: [
                {
                    type: 1,
                    components: [
                        {
                            type: 4,
                            custom_id: 'license_key',
                            label,
                            placeholder,
                            style: 1,
                            required: true,
                            max_length: 64
                        }
                    ]
                }
            ]
        }
    };
}

function jsonResponse(res, statusCode, payload) {
    res.status(statusCode).json(payload);
}

function verifyDiscordSignature(req) {
    if (!PUBLIC_KEY) {
        discordBotState.lastError = 'missing_public_key';
        return false;
    }

    const signature = req.get('X-Signature-Ed25519');
    const timestamp = req.get('X-Signature-Timestamp');
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body || ''), 'utf8');

    if (!signature || !timestamp) {
        discordBotState.lastError = 'missing_signature_headers';
        return false;
    }

    try {
        return nacl.sign.detached.verify(
            Buffer.from(timestamp + rawBody.toString('utf8')),
            Buffer.from(signature, 'hex'),
            Buffer.from(PUBLIC_KEY, 'hex')
        );
    } catch (error) {
        discordBotState.lastError = error?.message || String(error);
        return false;
    }
}

async function requestDiscordApi(method, path, token, body) {
    const response = await fetch(`https://discord.com/api/v10${path}`, {
        method,
        headers: {
            Authorization: `Bot ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'VEXION-Interactions/1.0'
        },
        body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Discord API ${response.status}: ${errorText.slice(0, 300)}`);
    }

    if (response.status === 204) {
        return null;
    }

    return response.json();
}

async function fetchTextChannelMessages(channelId, token, limit = 25) {
    return requestDiscordApi('GET', `/channels/${channelId}/messages?limit=${limit}`, token);
}

async function replacePanelMessage(channelId, title, token, payload) {
    const messages = await fetchTextChannelMessages(channelId, token, 25).catch(() => []);

    for (const message of messages || []) {
        if (!Array.isArray(message?.embeds)) continue;
        const hasMatchingTitle = message.embeds.some(embed => embed?.title === title);
        if (hasMatchingTitle) {
            await requestDiscordApi('DELETE', `/channels/${channelId}/messages/${message.id}`, token).catch(() => {});
        }
    }

    await requestDiscordApi('POST', `/channels/${channelId}/messages`, token, payload);
}

function buildCommandDefinitions() {
    return [
        { name: 'panel', description: 'Open the main VEXION panel.', type: 1 },
        { name: 'ping', description: 'Check API/interaction status.', type: 1 },
        { name: 'status', description: 'Check your linked subscription information.', type: 1 },
        {
            name: 'redeem_key',
            description: 'Link a license key to your Discord account.',
            type: 1,
            options: [{ type: 3, name: 'key', description: 'Your license key', required: true }]
        },
        {
            name: 'link',
            description: 'Link your license to your Discord account.',
            type: 1,
            options: [{ type: 3, name: 'key', description: 'Your license key', required: true }]
        },
        {
            name: 'genkey',
            description: 'Admin: generate a voucher key or pre-register an account.',
            type: 1,
            options: [
                {
                    type: 3,
                    name: 'game',
                    description: 'Choose the game access tier',
                    required: true,
                    choices: PRODUCT_CHOICES.map(choice => ({ name: choice, value: choice }))
                },
                { type: 10, name: 'days', description: 'Duration in days (999 for lifetime)', required: false },
                { type: 3, name: 'email', description: 'Optional reserved/pre-register email', required: false },
                { type: 3, name: 'password', description: 'Optional pre-register password', required: false },
                { type: 5, name: 'pre_register', description: 'Create or update the user account before redemption', required: false }
            ]
        },
        {
            name: 'announce_loader',
            description: 'Admin: send a loader toast notification.',
            type: 1,
            options: [
                { type: 3, name: 'title', description: 'Short notification title', required: true },
                { type: 3, name: 'message', description: 'Main message shown in the loader toast', required: true }
            ]
        },
        { name: 'resets', description: 'Admin: list pending HWID reset requests.', type: 1 },
        {
            name: 'approve',
            description: 'Admin: approve a pending HWID reset request.',
            type: 1,
            options: [{ type: 3, name: 'request_id', description: 'MongoDB request ID', required: true }]
        },
        {
            name: 'deny',
            description: 'Admin: deny a pending HWID reset request.',
            type: 1,
            options: [{ type: 3, name: 'request_id', description: 'MongoDB request ID', required: true }]
        }
    ];
}

function hasAdminAccess(interaction) {
    const userId = String(interaction?.member?.user?.id || interaction?.user?.id || '');
    if (userId === String(ADMIN_USER_ID)) return true;

    const permissions = BigInt(interaction?.member?.permissions || '0');
    const ADMINISTRATOR = BigInt(0x8);
    return (permissions & ADMINISTRATOR) === ADMINISTRATOR;
}

async function linkLicenseToDiscord(User, cleanKey, discordUserId) {
    const targetLicense = await User.findOne({ license_key: cleanKey }).lean();

    if (!targetLicense) {
        return { ok: false, message: `Key \`${cleanKey}\` was not found.` };
    }

    const existingId = String(targetLicense.discord_id || '').trim();
    if (existingId && existingId !== String(discordUserId)) {
        return { ok: false, message: 'This key is already linked to another Discord account.' };
    }

    await User.updateOne({ _id: targetLicense._id }, { $set: { discord_id: String(discordUserId) } });

    return { ok: true, pending: isPendingVoucher(targetLicense), user: targetLicense };
}

async function processResetRequest(mongoose, User, requestId, status) {
    let objectId;
    try {
        objectId = new ObjectId(requestId);
    } catch {
        return { ok: false, message: 'Invalid request ID.' };
    }

    const requestsCollection = mongoose.connection.collection('requests');
    const requestDoc = await requestsCollection.findOneAndUpdate(
        { _id: objectId, status: 'PENDING' },
        { $set: { status, resolved_at: new Date() } },
        { returnDocument: 'after', includeResultMetadata: false }
    );

    if (!requestDoc) {
        return { ok: false, message: 'Request not found or already processed.' };
    }

    const licenseKey = String(requestDoc.license_key || '').toUpperCase();
    if (status === 'APPROVED') {
        await User.updateOne({ license_key: licenseKey }, { $set: { hwid: null } });
        return { ok: true, message: `Approved HWID reset for \`${licenseKey}\`.` };
    }

    return { ok: true, message: `Denied HWID reset for \`${licenseKey}\`.` };
}

function getModalTextValue(interaction, customId) {
    const rows = interaction?.data?.components || [];
    for (const row of rows) {
        for (const component of row.components || []) {
            if (component.custom_id === customId) {
                return component.value;
            }
        }
    }
    return '';
}

async function sendLoaderAnnouncement(token, interaction, title, message) {
    const embed = {
        title: title.slice(0, 240),
        description: message.slice(0, 3900),
        color: 0x3B82F6,
        timestamp: new Date().toISOString(),
        author: {
            name: interaction?.member?.user?.username || interaction?.user?.username || 'Admin'
        },
        footer: {
            text: 'Loader Admin Notification'
        }
    };

    await requestDiscordApi('POST', `/channels/${LOADER_ALERT_CHANNEL_ID}/messages`, token, {
        embeds: [embed]
    });
}

async function syncCommands(token) {
    await requestDiscordApi(
        'PUT',
        `/applications/${APPLICATION_ID}/guilds/${GUILD_ID}/commands`,
        token,
        buildCommandDefinitions()
    );
    discordBotState.commandsSyncedAt = new Date().toISOString();
}

async function refreshStartupPanels(token) {
    const licensePanel = {
        embeds: [{
            title: 'VEXION License Panel',
            description: 'Manage your key, link your Discord, and check your current account status.',
            color: 0x5865F2,
            fields: [
                embedField('Redeem Key', 'Link a license key to your Discord account.', false),
                embedField('Buy License', 'Open the official store link.', false),
                embedField('Quick Tip', 'Use `/status` after redeeming to verify your subscription.', false)
            ],
            footer: { text: 'VEXION • Secure License Management' }
        }],
        components: buildPanelComponents()
    };

    const hwidPanel = {
        embeds: [{
            title: 'HWID Reset Panel',
            description: 'Need to switch machines or resolve login issues?\nClick below to submit an HWID reset request.',
            color: 0xF59E0B,
            fields: [
                embedField('Important', 'Requests start as pending and must be approved by staff before the HWID is cleared.', false)
            ],
            footer: { text: 'VEXION • Secure HWID Management' }
        }],
        components: buildHwidResetComponents()
    };

    await replacePanelMessage(PANEL_CHANNEL_ID, 'VEXION License Panel', token, licensePanel);
    await replacePanelMessage(HWID_RESET_CHANNEL_ID, 'HWID Reset Panel', token, hwidPanel);
    discordBotState.panelsRefreshedAt = new Date().toISOString();
}

function initDiscordBot() {
    const token = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN || process.env.TOKEN;
    discordBotState.initRequestedAt = new Date().toISOString();
    discordBotState.tokenPresent = Boolean(token);
    discordBotState.publicKeyPresent = Boolean(PUBLIC_KEY);
    discordBotState.lastDebug = 'interactions_mode';

    console.log(`[DISCORD INTERACTIONS] Init requested. token_present=${token ? 'yes' : 'no'} public_key_present=${PUBLIC_KEY ? 'yes' : 'no'} guild_id=${GUILD_ID}`);

    if (!token) {
        discordBotState.lastError = 'missing_token';
        console.log('[DISCORD INTERACTIONS] Skipping command sync: no token configured.');
        return;
    }

    syncCommands(token)
        .then(() => {
            console.log('[DISCORD INTERACTIONS] Slash commands synced.');
        })
        .catch(error => {
            discordBotState.lastError = error?.message || String(error);
            console.error('[DISCORD INTERACTIONS] Slash command sync failed:', error.message);
        });

    refreshStartupPanels(token)
        .then(() => {
            console.log('[DISCORD INTERACTIONS] Startup panels refreshed.');
        })
        .catch(error => {
            discordBotState.lastWarn = error?.message || String(error);
            console.warn('[DISCORD INTERACTIONS] Startup panel refresh failed:', error.message);
        });
}

function getDiscordBotStatus() {
    return {
        ...discordBotState,
        endpointConfigured: Boolean(PUBLIC_KEY)
    };
}

function createDiscordInteractionsHandler({ User, mongoose }) {
    return async (req, res) => {
        if (!verifyDiscordSignature(req)) {
            return jsonResponse(res, 401, { error: 'invalid_request_signature' });
        }

        discordBotState.endpointConfigured = true;

        let interaction;
        try {
            interaction = JSON.parse(Buffer.from(req.body).toString('utf8'));
        } catch (error) {
            discordBotState.lastError = error?.message || String(error);
            return jsonResponse(res, 400, { error: 'invalid_json_body' });
        }

        const interactionType = interaction?.type;
        const token = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN || process.env.TOKEN;

        if (interactionType === 1) {
            return jsonResponse(res, 200, { type: 1 });
        }

        if (interactionType === 2) {
            const commandName = interaction?.data?.name;
            const discordUser = interaction?.member?.user || interaction?.user || {};

            if (commandName === 'panel') {
                return jsonResponse(res, 200, interactionMessageResponse({
                    content: 'Use the buttons below to buy or redeem your key.',
                    embeds: [{ title: 'VEXION Panel', color: 0x5865F2 }],
                    components: buildPanelComponents()
                }));
            }

            if (commandName === 'ping') {
                return jsonResponse(res, 200, interactionMessageResponse({
                    content: 'Discord interactions endpoint is online.'
                }));
            }

            if (commandName === 'status') {
                const userData = await User.findOne({ discord_id: String(discordUser.id) }).lean();

                if (!userData) {
                    return jsonResponse(res, 200, interactionMessageResponse({
                        embeds: [{
                            title: 'No Account Linked',
                            description: 'Your Discord account is not linked to any current key.\nUse `/redeem_key` or the panel button first.',
                            color: 0xEF4444
                        }]
                    }));
                }

                return jsonResponse(res, 200, interactionMessageResponse({
                    embeds: [buildStatusEmbed(userData, discordUser)]
                }));
            }

            if (commandName === 'redeem_key' || commandName === 'link') {
                const cleanKey = String(getCommandOption(interaction, 'key') || '').trim().toUpperCase();
                const result = await linkLicenseToDiscord(User, cleanKey, discordUser.id);

                if (!result.ok) {
                    return jsonResponse(res, 200, interactionMessageResponse({ content: result.message }));
                }

                if (result.pending) {
                    return jsonResponse(res, 200, interactionMessageResponse({
                        content:
                            `Voucher linked to your Discord.\n` +
                            `License: \`${cleanKey}\`\n` +
                            `Use the loader to finish redemption and activate the voucher.`
                    }));
                }

                return jsonResponse(res, 200, interactionMessageResponse({
                    embeds: [buildStatusEmbed(result.user, discordUser)]
                }));
            }

            if (commandName === 'genkey') {
                if (!hasAdminAccess(interaction)) {
                    return jsonResponse(res, 200, interactionMessageResponse({ content: 'Admin access required.' }));
                }

                const game = normalizeGameName(getCommandOption(interaction, 'game'));
                const days = Number(getCommandOption(interaction, 'days') ?? 30);
                const email = String(getCommandOption(interaction, 'email') || '').trim().toLowerCase();
                const password = String(getCommandOption(interaction, 'password') || '').trim();
                const shouldPreRegister = Boolean(getCommandOption(interaction, 'pre_register'));

                if (shouldPreRegister && !email) {
                    return jsonResponse(res, 200, interactionMessageResponse({
                        content: 'Email is required when `pre_register` is enabled.'
                    }));
                }

                const newKey = generateLicenseKey(game);
                const voucherDoc = new User({
                    license_key: newKey,
                    duration_days: days,
                    games: [game],
                    email: buildPendingVoucherEmail(newKey),
                    password: null,
                    hwid: null,
                    expiry_date: null,
                    reserved_email: email || null
                });

                let existingUser = null;
                let accountCreated = false;

                if (email) {
                    existingUser = await User.findOne({ email });
                }

                if (shouldPreRegister) {
                    if (existingUser) {
                        if (!existingUser.password && password) {
                            existingUser.password = password;
                            await existingUser.save();
                        }
                    } else {
                        await new User({
                            email,
                            password: password || null,
                            hwid: null,
                            games: [],
                            expiry_date: null,
                            license_key: null,
                            duration_days: days
                        }).save();
                        accountCreated = true;
                    }
                }

                await voucherDoc.save();

                const mode = shouldPreRegister
                    ? (accountCreated ? 'pre-registered-new-user' : 'pre-registered-existing-user')
                    : (email ? 'reserved-key' : 'standalone-key');

                return jsonResponse(res, 200, interactionMessageResponse({
                    embeds: [{
                        title: 'Key Generated',
                        color: 0x22C55E,
                        fields: [
                            embedField('License', `\`${newKey}\``, false),
                            embedField('Game', `\`${game}\``, true),
                            embedField('Duration', `\`${days}\` days`, true),
                            embedField('Mode', `\`${mode}\``, false),
                            ...(email ? [embedField('Email', `\`${email}\``, false)] : []),
                            ...(password ? [embedField('Password', `\`${password}\``, false)] : [])
                        ],
                        timestamp: new Date().toISOString()
                    }]
                }));
            }

            if (commandName === 'announce_loader') {
                if (!hasAdminAccess(interaction)) {
                    return jsonResponse(res, 200, interactionMessageResponse({ content: 'Admin access required.' }));
                }

                if (!token) {
                    return jsonResponse(res, 200, interactionMessageResponse({ content: 'DISCORD_TOKEN is missing on the API service.' }));
                }

                const title = String(getCommandOption(interaction, 'title') || '').trim();
                const message = String(getCommandOption(interaction, 'message') || '').trim();

                await sendLoaderAnnouncement(token, interaction, title, message);

                return jsonResponse(res, 200, interactionMessageResponse({
                    content: `Loader announcement sent to <#${LOADER_ALERT_CHANNEL_ID}>.`
                }));
            }

            if (commandName === 'resets') {
                if (!hasAdminAccess(interaction)) {
                    return jsonResponse(res, 200, interactionMessageResponse({ content: 'Admin access required.' }));
                }

                const pending = await mongoose.connection.collection('requests')
                    .find({ status: 'PENDING' })
                    .sort({ date: -1 })
                    .limit(10)
                    .toArray();

                if (pending.length === 0) {
                    return jsonResponse(res, 200, interactionMessageResponse({ content: 'No pending HWID reset requests.' }));
                }

                const lines = pending.map((reqDoc, index) => {
                    const when = formatExpiry(reqDoc?.date);
                    return `${index + 1}. \`${reqDoc._id}\` | \`${reqDoc.license_key || 'N/A'}\` | ${when}`;
                }).join('\n');

                return jsonResponse(res, 200, interactionMessageResponse({
                    content: `Pending HWID reset requests:\n${lines}\nUse /approve or /deny with the request ID, or the buttons below for the first 5.`,
                    components: buildResetActionRows(pending)
                }));
            }

            if (commandName === 'approve' || commandName === 'deny') {
                if (!hasAdminAccess(interaction)) {
                    return jsonResponse(res, 200, interactionMessageResponse({ content: 'Admin access required.' }));
                }

                const requestId = String(getCommandOption(interaction, 'request_id') || '').trim();
                const status = commandName === 'approve' ? 'APPROVED' : 'DENIED';
                const result = await processResetRequest(mongoose, User, requestId, status);

                return jsonResponse(res, 200, interactionMessageResponse({ content: result.message }));
            }

            return jsonResponse(res, 200, interactionMessageResponse({ content: 'Unknown command.' }));
        }

        if (interactionType === 3) {
            const customId = interaction?.data?.custom_id || '';

            if (customId === 'buy_license_btn') {
                return jsonResponse(res, 200, interactionMessageResponse({ content: STORE_URL }));
            }

            if (customId === 'redeem_key_btn') {
                return jsonResponse(res, 200, interactionModalResponse({
                    customId: 'redeem_key_modal',
                    title: 'Redeem Your License Key',
                    label: 'License Key',
                    placeholder: 'CS2X-XXXX-XXXX-XXXX'
                }));
            }

            if (customId === 'reset_hwid_btn') {
                return jsonResponse(res, 200, interactionModalResponse({
                    customId: 'hwid_reset_modal',
                    title: 'HWID Reset Request',
                    label: 'Enter your License Key',
                    placeholder: 'CS2X-XXXX-XXXX-XXXX'
                }));
            }

            if (customId.startsWith('approve_reset:') || customId.startsWith('deny_reset:')) {
                if (!hasAdminAccess(interaction)) {
                    return jsonResponse(res, 200, interactionMessageResponse({ content: 'Admin access required.' }));
                }

                const [, requestId] = customId.split(':');
                const status = customId.startsWith('approve_reset:') ? 'APPROVED' : 'DENIED';
                const result = await processResetRequest(mongoose, User, requestId, status);

                return jsonResponse(res, 200, interactionMessageResponse({ content: result.message }));
            }

            return jsonResponse(res, 200, interactionMessageResponse({ content: 'Unknown button action.' }));
        }

        if (interactionType === 5) {
            const modalId = interaction?.data?.custom_id || '';
            const cleanKey = String(getModalTextValue(interaction, 'license_key') || '').trim().toUpperCase();
            const discordUser = interaction?.member?.user || interaction?.user || {};

            if (modalId === 'redeem_key_modal') {
                const result = await linkLicenseToDiscord(User, cleanKey, discordUser.id);

                if (!result.ok) {
                    return jsonResponse(res, 200, interactionMessageResponse({ content: result.message }));
                }

                if (result.pending) {
                    return jsonResponse(res, 200, interactionMessageResponse({
                        content:
                            `Voucher linked to your Discord.\n` +
                            `License: \`${cleanKey}\`\n` +
                            `Use the loader to finish redemption and activate the voucher.`
                    }));
                }

                return jsonResponse(res, 200, interactionMessageResponse({
                    embeds: [buildStatusEmbed(result.user, discordUser)]
                }));
            }

            if (modalId === 'hwid_reset_modal') {
                const requestsCollection = mongoose.connection.collection('requests');
                const userData = await User.findOne({ license_key: cleanKey }).lean();

                if (!userData) {
                    return jsonResponse(res, 200, interactionMessageResponse({ content: `Key \`${cleanKey}\` was not found.` }));
                }

                const existingPending = await requestsCollection.findOne(
                    { license_key: cleanKey, status: 'PENDING' },
                    { sort: { date: -1 } }
                );

                if (existingPending) {
                    return jsonResponse(res, 200, interactionMessageResponse({ content: 'A reset request is already pending for this key.' }));
                }

                await requestsCollection.insertOne({
                    hwid: userData.hwid || 'N/A',
                    license_key: cleanKey,
                    type: 'ADMIN-PANEL_RESET',
                    status: 'PENDING',
                    date: new Date(),
                    discord_id: String(discordUser.id)
                });

                await User.updateOne(
                    { _id: userData._id },
                    { $set: { discord_id: String(discordUser.id) } }
                );

                return jsonResponse(res, 200, interactionMessageResponse({
                    content: `Reset request created for \`${cleanKey}\`. An admin can now approve it.`
                }));
            }
        }

        return jsonResponse(res, 400, { error: 'unsupported_interaction_type' });
    };
}

module.exports = {
    createDiscordInteractionsHandler,
    getDiscordBotStatus,
    initDiscordBot
};
