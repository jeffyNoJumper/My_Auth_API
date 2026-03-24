require('dotenv').config();

const { buildCommandDefinitions } = require('../loader/discordBot');

const token = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN || process.env.TOKEN;
const applicationId = process.env.DISCORD_APPLICATION_ID || process.env.APPLICATION_ID || process.env.CLIENT_ID || '1476724607485743277';
const guildId = process.env.GUILD_ID || '1244947057320661043';

async function main() {
    if (!token) {
        throw new Error('Missing DISCORD_TOKEN / DISCORD_BOT_TOKEN / TOKEN');
    }

    const commands = buildCommandDefinitions();
    const response = await fetch(`https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`, {
        method: 'PUT',
        headers: {
            Authorization: `Bot ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'VEXION-Command-Sync/1.0'
        },
        body: JSON.stringify(commands)
    });

    const raw = await response.text();
    if (!response.ok) {
        throw new Error(`Discord API ${response.status}: ${raw.slice(0, 500)}`);
    }

    const parsed = raw ? JSON.parse(raw) : [];
    console.log(`Registered ${Array.isArray(parsed) ? parsed.length : 0} guild commands for ${guildId}.`);
}

main().catch(error => {
    console.error(error.message || error);
    process.exit(1);
});
