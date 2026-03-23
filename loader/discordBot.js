const crypto = require('crypto');
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Client,
    EmbedBuilder,
    GatewayIntentBits,
    ModalBuilder,
    PermissionsBitField,
    REST,
    Routes,
    SlashCommandBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const { ObjectId } = require('mongodb');

const GUILD_ID = process.env.GUILD_ID || '1244947057320661043';
const ADMIN_USER_ID = process.env.ADMIN_USER_ID || '1280926025789870209';
const PANEL_CHANNEL_ID = process.env.PANEL_CHANNEL_ID || '1469005198700712046';
const HWID_RESET_CHANNEL_ID = process.env.HWID_RESET_CHANNEL_ID || '1403918366623797268';
const LOADER_ALERT_CHANNEL_ID = process.env.DISCORD_LOADER_ALERT_CHANNEL_ID || '1373760247658971256';
const STORE_URL = process.env.STORE_URL || 'https://whosthesource.mysellauth.com';
const ALLOWED_ROLE_NAME = process.env.ALLOWED_ROLE_NAME || 'Admin';
const FOUNDER_ROLE_NAME = process.env.FOUNDER_ROLE_NAME || 'SB | OWNER';

const PRODUCT_CHOICES = ['CS2', 'FiveM', 'GTAV', 'Warzone', 'All-Access'];

let discordClient = null;
const discordBotState = {
    initRequestedAt: null,
    loginStartedAt: null,
    readyAt: null,
    ready: false,
    userTag: null,
    lastError: null,
    lastWarn: null,
    lastDebug: null,
    shardStatus: 'idle'
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

function formatExpiry(expiryValue) {
    if (!(expiryValue instanceof Date)) {
        return 'Not Set';
    }

    return expiryValue.toISOString().replace('T', ' ').replace('.000Z', ' UTC');
}

function buildMainPanelRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('buy_license_btn')
            .setLabel('Buy License')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('redeem_key_btn')
            .setLabel('Redeem Key')
            .setStyle(ButtonStyle.Success)
    );
}

function buildHwidResetRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('reset_hwid_btn')
            .setLabel('Reset HWID')
            .setStyle(ButtonStyle.Danger)
    );
}

function buildResetApprovalRow(requestId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`approve_reset:${requestId}`)
            .setLabel('Approve')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`deny_reset:${requestId}`)
            .setLabel('Deny')
            .setStyle(ButtonStyle.Danger)
    );
}

function buildStatusEmbed(user, discordUser) {
    const now = new Date();
    const expiry = user?.expiry_date instanceof Date ? user.expiry_date : null;
    const statusText = expiry
        ? (now < expiry ? 'Active' : 'Expired')
        : (isPendingVoucher(user) ? 'Pending Setup' : 'Active (No Expiry Set)');

    const games = Array.isArray(user?.games) && user.games.length > 0 ? user.games.join(', ') : 'General';
    const hwidStatus = user?.hwid ? 'Locked' : 'Not Set';
    const banStatus = user?.is_banned ? 'BANNED' : 'CLEAN';

    const embed = new EmbedBuilder()
        .setTitle('Account Subscription Info')
        .setColor(user?.is_banned ? 0x8B0000 : 0x22C55E)
        .addFields(
            { name: 'License Key', value: `\`${user?.license_key || 'Not Set'}\``, inline: false },
            { name: 'Product', value: `\`${games}\``, inline: true },
            { name: 'Status', value: `\`${statusText}\``, inline: true },
            { name: 'Account', value: `\`${banStatus}\``, inline: true },
            { name: 'Expires', value: `\`${formatExpiry(expiry)}\``, inline: false },
            { name: 'HWID Status', value: `\`${hwidStatus}\``, inline: true }
        )
        .setFooter({ text: `Discord ID: ${discordUser.id}` });

    if (discordUser?.displayAvatarURL) {
        embed.setThumbnail(discordUser.displayAvatarURL());
    }

    if (isPendingVoucher(user)) {
        embed.addFields({
            name: 'Voucher State',
            value: `\`Pending voucher\`\nReserved Email: \`${user?.reserved_email || 'No reserved email'}\``,
            inline: false
        });
    }

    return embed;
}

async function hasAdminAccess(interaction) {
    if (String(interaction.user.id) === String(ADMIN_USER_ID)) {
        return true;
    }

    if (interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
        return true;
    }

    try {
        if (!interaction.guild) {
            return false;
        }

        const member = await interaction.guild.members.fetch(interaction.user.id);
        const roleNames = new Set(member.roles.cache.map(role => role.name));
        return roleNames.has(ALLOWED_ROLE_NAME) || roleNames.has(FOUNDER_ROLE_NAME);
    } catch {
        return false;
    }
}

async function ensureAdmin(interaction) {
    if (await hasAdminAccess(interaction)) {
        return true;
    }

    const payload = { content: 'Admin access required.', ephemeral: true };
    if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload);
    } else {
        await interaction.reply(payload);
    }
    return false;
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

    await User.updateOne(
        { _id: targetLicense._id },
        { $set: { discord_id: String(discordUserId) } }
    );

    return {
        ok: true,
        pending: isPendingVoucher(targetLicense),
        user: targetLicense
    };
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

async function fetchTextChannel(client, channelId) {
    try {
        const channel = await client.channels.fetch(channelId);
        if (channel && channel.isTextBased()) {
            return channel;
        }
    } catch (error) {
        console.error(`[DISCORD BOT] Failed to fetch channel ${channelId}:`, error.message);
    }

    return null;
}

async function replacePanelMessage(client, channelId, title, embed, rows) {
    const channel = await fetchTextChannel(client, channelId);
    if (!channel) {
        return;
    }

    const messages = await channel.messages.fetch({ limit: 25 });
    for (const message of messages.values()) {
        if (message.author.id !== client.user.id) {
            continue;
        }
        if (message.embeds.some(existing => existing.title === title)) {
            await message.delete().catch(() => {});
        }
    }

    await channel.send({ embeds: [embed], components: rows });
}

function buildCommands() {
    return [
        new SlashCommandBuilder()
            .setName('panel')
            .setDescription('Open the main VEXION panel.'),
        new SlashCommandBuilder()
            .setName('ping')
            .setDescription('Check bot latency.'),
        new SlashCommandBuilder()
            .setName('status')
            .setDescription('Check your linked subscription information.'),
        new SlashCommandBuilder()
            .setName('redeem_key')
            .setDescription('Link a license key to your Discord account.')
            .addStringOption(option =>
                option.setName('key')
                    .setDescription('Your license key')
                    .setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName('link')
            .setDescription('Link your license to your Discord account.')
            .addStringOption(option =>
                option.setName('key')
                    .setDescription('Your license key')
                    .setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName('genkey')
            .setDescription('Admin: generate a voucher key or pre-register an account.')
            .addStringOption(option =>
                option.setName('game')
                    .setDescription('Choose the game access tier')
                    .setRequired(true)
                    .addChoices(...PRODUCT_CHOICES.map(choice => ({ name: choice, value: choice })))
            )
            .addNumberOption(option =>
                option.setName('days')
                    .setDescription('Duration in days (999 for lifetime)')
                    .setRequired(false)
            )
            .addStringOption(option =>
                option.setName('email')
                    .setDescription('Optional reserved/pre-register email')
                    .setRequired(false)
            )
            .addStringOption(option =>
                option.setName('password')
                    .setDescription('Optional pre-register password')
                    .setRequired(false)
            )
            .addBooleanOption(option =>
                option.setName('pre_register')
                    .setDescription('Create or update the user account before redemption')
                    .setRequired(false)
            ),
        new SlashCommandBuilder()
            .setName('announce_loader')
            .setDescription('Admin: send a loader toast notification.')
            .addStringOption(option =>
                option.setName('title')
                    .setDescription('Short notification title')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('message')
                    .setDescription('Main message shown in the loader toast')
                    .setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName('resets')
            .setDescription('Admin: list pending HWID reset requests.'),
        new SlashCommandBuilder()
            .setName('approve')
            .setDescription('Admin: approve a pending HWID reset request.')
            .addStringOption(option =>
                option.setName('request_id')
                    .setDescription('MongoDB request ID')
                    .setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName('deny')
            .setDescription('Admin: deny a pending HWID reset request.')
            .addStringOption(option =>
                option.setName('request_id')
                    .setDescription('MongoDB request ID')
                    .setRequired(true)
            )
    ].map(command => command.toJSON());
}

async function syncCommands(client, token) {
    const rest = new REST({ version: '10' }).setToken(token);
    await rest.put(
        Routes.applicationGuildCommands(client.user.id, GUILD_ID),
        { body: buildCommands() }
    );
}

async function sendStartupPanels(client) {
    const licenseEmbed = new EmbedBuilder()
        .setTitle('VEXION License Panel')
        .setDescription('Manage your key, link your Discord, and check your current account status.')
        .setColor(0x5865F2)
        .addFields(
            { name: 'Redeem Key', value: 'Link a license key to your Discord account.', inline: false },
            { name: 'Buy License', value: 'Open the official store link.', inline: false },
            { name: 'Quick Tip', value: 'Use `/status` after redeeming to verify your subscription.', inline: false }
        )
        .setFooter({ text: 'VEXION • Secure License Management' });

    const hwidEmbed = new EmbedBuilder()
        .setTitle('HWID Reset Panel')
        .setDescription('Need to switch machines or resolve login issues?\nClick below to submit an HWID reset request.')
        .setColor(0xF59E0B)
        .addFields({
            name: 'Important',
            value: 'Requests start as pending and must be approved by staff before the HWID is cleared.',
            inline: false
        })
        .setFooter({ text: 'VEXION • Secure HWID Management' });

    await replacePanelMessage(client, PANEL_CHANNEL_ID, licenseEmbed.data.title, licenseEmbed, [buildMainPanelRow()]);
    await replacePanelMessage(client, HWID_RESET_CHANNEL_ID, hwidEmbed.data.title, hwidEmbed, [buildHwidResetRow()]);
}

async function handleCommand(interaction, deps) {
    const { User, mongoose } = deps;
    const commandName = interaction.commandName;

    if (commandName === 'panel') {
        const embed = new EmbedBuilder()
            .setTitle('VEXION Panel')
            .setDescription('Use the buttons below to buy or redeem your key.')
            .setColor(0x5865F2);

        await interaction.reply({
            embeds: [embed],
            components: [buildMainPanelRow()],
            ephemeral: true
        });
        return;
    }

    if (commandName === 'ping') {
        const start = performance.now();
        await interaction.reply({ content: 'Pinging...', ephemeral: true });
        const rtt = performance.now() - start;
        const ws = Math.round(interaction.client.ws.ping);
        const uptime = Math.floor(process.uptime());
        await interaction.editReply(`Pong | RTT ${rtt.toFixed(1)}ms | WS ${ws}ms | Uptime ${uptime}s`);
        return;
    }

    if (commandName === 'status') {
        const userData = await User.findOne({ discord_id: String(interaction.user.id) }).lean();
        if (!userData) {
            const embed = new EmbedBuilder()
                .setTitle('No Account Linked')
                .setDescription('Your Discord account is not linked to any current key.\nUse `/redeem_key` or the panel button first.')
                .setColor(0xEF4444);
            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        }

        if (userData.expiry_date && !(userData.expiry_date instanceof Date) && userData.expiry_date.$date) {
            userData.expiry_date = new Date(userData.expiry_date.$date);
        }

        await interaction.reply({
            embeds: [buildStatusEmbed(userData, interaction.user)],
            ephemeral: true
        });
        return;
    }

    if (commandName === 'redeem_key' || commandName === 'link') {
        await interaction.deferReply({ ephemeral: true });
        const cleanKey = interaction.options.getString('key', true).trim().toUpperCase();
        const result = await linkLicenseToDiscord(User, cleanKey, interaction.user.id);

        if (!result.ok) {
            await interaction.editReply(result.message);
            return;
        }

        if (result.pending) {
            await interaction.editReply(
                `Voucher linked to your Discord.\n` +
                `License: \`${cleanKey}\`\n` +
                `Use the loader to finish redemption and activate the voucher.`
            );
            return;
        }

        await interaction.editReply({
            content: '',
            embeds: [buildStatusEmbed(result.user, interaction.user)]
        });
        return;
    }

    if (commandName === 'genkey') {
        if (!(await ensureAdmin(interaction))) {
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        const game = normalizeGameName(interaction.options.getString('game', true));
        const days = interaction.options.getNumber('days') ?? 30;
        const email = (interaction.options.getString('email') || '').trim().toLowerCase();
        const password = (interaction.options.getString('password') || '').trim();
        const shouldPreRegister = interaction.options.getBoolean('pre_register') || false;

        if (shouldPreRegister && !email) {
            await interaction.editReply('Email is required when `pre_register` is enabled.');
            return;
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

        const embed = new EmbedBuilder()
            .setTitle('Key Generated')
            .setColor(0x22C55E)
            .addFields(
                { name: 'License', value: `\`${newKey}\``, inline: false },
                { name: 'Game', value: `\`${game}\``, inline: true },
                { name: 'Duration', value: `\`${days}\` days`, inline: true },
                { name: 'Mode', value: `\`${mode}\``, inline: false }
            )
            .setTimestamp(new Date());

        if (email) {
            embed.addFields({ name: 'Email', value: `\`${email}\``, inline: false });
        }

        if (password) {
            embed.addFields({ name: 'Password', value: `\`${password}\``, inline: false });
        }

        await interaction.editReply({ embeds: [embed] });
        return;
    }

    if (commandName === 'announce_loader') {
        if (!(await ensureAdmin(interaction))) {
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        const channel = await fetchTextChannel(interaction.client, LOADER_ALERT_CHANNEL_ID);
        if (!channel) {
            await interaction.editReply(`Loader alert channel not found: \`${LOADER_ALERT_CHANNEL_ID}\``);
            return;
        }

        const title = interaction.options.getString('title', true).trim().slice(0, 240);
        const message = interaction.options.getString('message', true).trim().slice(0, 3900);

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(message)
            .setColor(0x3B82F6)
            .setTimestamp(new Date())
            .setAuthor({
                name: interaction.user.displayName || interaction.user.username,
                iconURL: interaction.user.displayAvatarURL()
            })
            .setFooter({ text: 'Loader Admin Notification' });

        await channel.send({ embeds: [embed] });
        await interaction.editReply(`Loader announcement sent to <#${LOADER_ALERT_CHANNEL_ID}>.`);
        return;
    }

    if (commandName === 'resets') {
        if (!(await ensureAdmin(interaction))) {
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        const pending = await mongoose.connection.collection('requests')
            .find({ status: 'PENDING' })
            .sort({ date: -1 })
            .limit(10)
            .toArray();

        if (pending.length === 0) {
            await interaction.editReply('No pending HWID reset requests.');
            return;
        }

        await interaction.editReply(`Found ${pending.length} pending reset request(s).`);

        for (const reqDoc of pending) {
            const rawDate = reqDoc?.date instanceof Date
                ? reqDoc.date
                : (reqDoc?.date?.$date ? new Date(reqDoc.date.$date) : null);

            const embed = new EmbedBuilder()
                .setTitle('HWID Reset Request')
                .setColor(0xF59E0B)
                .addFields(
                    { name: 'License Key', value: `\`${reqDoc.license_key || 'N/A'}\``, inline: false },
                    { name: 'Current HWID', value: `\`${reqDoc.hwid || reqDoc.old_hwid || 'N/A'}\``, inline: false },
                    { name: 'Requested At', value: `\`${formatExpiry(rawDate)}\``, inline: false }
                );

            if (reqDoc.new_hwid) {
                embed.addFields({ name: 'Requested HWID', value: `\`${reqDoc.new_hwid}\``, inline: false });
            }

            await interaction.followUp({
                embeds: [embed],
                components: [buildResetApprovalRow(String(reqDoc._id))],
                ephemeral: true
            });
        }
        return;
    }

    if (commandName === 'approve' || commandName === 'deny') {
        if (!(await ensureAdmin(interaction))) {
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        const requestId = interaction.options.getString('request_id', true).trim();
        const status = commandName === 'approve' ? 'APPROVED' : 'DENIED';
        const result = await processResetRequest(mongoose, User, requestId, status);
        await interaction.editReply(result.message);
    }
}

async function handleButton(interaction, deps) {
    const { User, mongoose } = deps;

    if (interaction.customId === 'buy_license_btn') {
        await interaction.reply({ content: STORE_URL, ephemeral: true });
        return;
    }

    if (interaction.customId === 'redeem_key_btn') {
        const modal = new ModalBuilder()
            .setCustomId('redeem_key_modal')
            .setTitle('Redeem Your License Key')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('license_key')
                        .setLabel('License Key')
                        .setPlaceholder('CS2X-XXXX-XXXX-XXXX')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMaxLength(64)
                )
            );

        await interaction.showModal(modal);
        return;
    }

    if (interaction.customId === 'reset_hwid_btn') {
        const modal = new ModalBuilder()
            .setCustomId('hwid_reset_modal')
            .setTitle('HWID Reset Request')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('license_key')
                        .setLabel('Enter your License Key')
                        .setPlaceholder('CS2X-XXXX-XXXX-XXXX')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMaxLength(64)
                )
            );

        await interaction.showModal(modal);
        return;
    }

    if (interaction.customId.startsWith('approve_reset:') || interaction.customId.startsWith('deny_reset:')) {
        if (!(await ensureAdmin(interaction))) {
            return;
        }

        const [action, requestId] = interaction.customId.split(':');
        const status = action === 'approve_reset' ? 'APPROVED' : 'DENIED';
        const result = await processResetRequest(mongoose, User, requestId, status);

        await interaction.update({
            content: result.message,
            embeds: [],
            components: []
        });
    }
}

async function handleModal(interaction, deps) {
    const { User, mongoose } = deps;

    if (interaction.customId === 'redeem_key_modal') {
        await interaction.deferReply({ ephemeral: true });
        const cleanKey = interaction.fields.getTextInputValue('license_key').trim().toUpperCase();
        const result = await linkLicenseToDiscord(User, cleanKey, interaction.user.id);

        if (!result.ok) {
            await interaction.editReply(result.message);
            return;
        }

        if (result.pending) {
            await interaction.editReply(
                `Voucher linked to your Discord.\n` +
                `License: \`${cleanKey}\`\n` +
                `Use the loader to finish redemption and activate the voucher.`
            );
            return;
        }

        await interaction.editReply({
            content: '',
            embeds: [buildStatusEmbed(result.user, interaction.user)]
        });
        return;
    }

    if (interaction.customId === 'hwid_reset_modal') {
        const cleanKey = interaction.fields.getTextInputValue('license_key').trim().toUpperCase();
        const requestsCollection = mongoose.connection.collection('requests');
        const userData = await User.findOne({ license_key: cleanKey }).lean();

        if (!userData) {
            await interaction.reply({ content: `Key \`${cleanKey}\` was not found.`, ephemeral: true });
            return;
        }

        const existingPending = await requestsCollection.findOne(
            { license_key: cleanKey, status: 'PENDING' },
            { sort: { date: -1 } }
        );

        if (existingPending) {
            await interaction.reply({ content: 'A reset request is already pending for this key.', ephemeral: true });
            return;
        }

        await requestsCollection.insertOne({
            hwid: userData.hwid || 'N/A',
            license_key: cleanKey,
            type: 'ADMIN-PANEL_RESET',
            status: 'PENDING',
            date: new Date(),
            discord_id: String(interaction.user.id)
        });

        await User.updateOne(
            { _id: userData._id },
            { $set: { discord_id: String(interaction.user.id) } }
        );

        await interaction.reply({
            content: `Reset request created for \`${cleanKey}\`. An admin can now approve it.`,
            ephemeral: true
        });
    }
}

function initDiscordBot({ User, mongoose }) {
    const token = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN || process.env.TOKEN;
    discordBotState.initRequestedAt = new Date().toISOString();
    console.log(`[DISCORD BOT] Init requested. token_present=${token ? 'yes' : 'no'} guild_id=${GUILD_ID}`);

    if (!token) {
        discordBotState.lastError = 'missing_token';
        console.log('[DISCORD BOT] Skipping Discord bot startup: no token configured.');
        return null;
    }

    if (discordClient) {
        return discordClient;
    }

    const client = new Client({
        intents: [GatewayIntentBits.Guilds]
    });

    client.on('error', error => {
        discordBotState.lastError = error?.message || String(error);
        console.error('[DISCORD BOT] Client error:', error);
    });

    client.on('warn', message => {
        discordBotState.lastWarn = message;
        console.warn('[DISCORD BOT] Warn:', message);
    });

    client.on('shardError', error => {
        discordBotState.lastError = error?.message || String(error);
        discordBotState.shardStatus = 'error';
        console.error('[DISCORD BOT] Shard error:', error);
    });

    client.on('shardReady', shardId => {
        discordBotState.shardStatus = `ready:${shardId}`;
        console.log(`[DISCORD BOT] Shard ready: ${shardId}`);
    });

    client.on('shardDisconnect', (event, shardId) => {
        discordBotState.shardStatus = `disconnected:${shardId}`;
        discordBotState.lastError = `disconnect code=${event?.code || 'unknown'}`;
        console.error(`[DISCORD BOT] Shard disconnected: ${shardId} code=${event?.code || 'unknown'}`);
    });

    client.on('invalidated', () => {
        discordBotState.shardStatus = 'invalidated';
        discordBotState.lastError = 'session invalidated';
        console.error('[DISCORD BOT] Session invalidated.');
    });

    client.on('debug', message => {
        if (message.includes('Heartbeat acknowledged') || message.includes('Keeping up')) {
            return;
        }
        discordBotState.lastDebug = message;
        console.log('[DISCORD BOT] Debug:', message);
    });

    client.once('ready', async readyClient => {
        discordBotState.ready = true;
        discordBotState.readyAt = new Date().toISOString();
        discordBotState.userTag = readyClient.user.tag;
        discordBotState.shardStatus = 'ready';
        console.log(`[DISCORD BOT] Logged in as ${readyClient.user.tag}`);

        try {
            await syncCommands(readyClient, token);
            console.log('[DISCORD BOT] Slash commands synced.');
        } catch (error) {
            console.error('[DISCORD BOT] Slash command sync failed:', error.message);
        }

        try {
            await sendStartupPanels(readyClient);
            console.log('[DISCORD BOT] Startup panels refreshed.');
        } catch (error) {
            console.error('[DISCORD BOT] Startup panel refresh failed:', error.message);
        }
    });

    client.on('interactionCreate', async interaction => {
        try {
            if (interaction.isChatInputCommand()) {
                await handleCommand(interaction, { User, mongoose });
                return;
            }

            if (interaction.isButton()) {
                await handleButton(interaction, { User, mongoose });
                return;
            }

            if (interaction.isModalSubmit()) {
                await handleModal(interaction, { User, mongoose });
            }
        } catch (error) {
            console.error('[DISCORD BOT] Interaction error:', error);

            const payload = { content: 'Discord bot command failed.', ephemeral: true };
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp(payload).catch(() => {});
            } else {
                await interaction.reply(payload).catch(() => {});
            }
        }
    });

    discordBotState.loginStartedAt = new Date().toISOString();
    console.log('[DISCORD BOT] Starting login...');

    client.login(token).catch(error => {
        discordBotState.lastError = error?.message || String(error);
        discordBotState.shardStatus = 'login_failed';
        console.error('[DISCORD BOT] Login failed:', error.message);
    });

    setTimeout(() => {
        if (!discordBotState.ready) {
            console.warn(`[DISCORD BOT] Ready timeout. last_debug=${discordBotState.lastDebug || 'none'} last_error=${discordBotState.lastError || 'none'} shard_status=${discordBotState.shardStatus}`);
        }
    }, 30000);

    discordClient = client;
    return client;
}

function getDiscordBotStatus() {
    return {
        ...discordBotState,
        client_exists: Boolean(discordClient),
        client_ready: Boolean(discordClient?.isReady?.()),
        guild_id: GUILD_ID,
        alert_channel_id: LOADER_ALERT_CHANNEL_ID
    };
}

module.exports = { initDiscordBot, getDiscordBotStatus };
