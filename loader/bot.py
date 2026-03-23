from __future__ import annotations

import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import discord
from bson import ObjectId
from discord import app_commands
from discord.ext import commands
from pymongo import MongoClient, ReturnDocument


BOT_START = time.time()

MONGO_URI = os.getenv("MONGO_URI") or os.getenv("MONGO_URL")
if not MONGO_URI:
    raise RuntimeError("MONGO_URI or MONGO_URL is required")

mongo_client = MongoClient(MONGO_URI)
try:
    db = mongo_client.get_default_database()
except Exception:
    db = None
if db is None:
    db = mongo_client[os.getenv("MONGO_DB_NAME", "test")]

users_collection = db["users"]
requests_collection = db["requests"]


GUILD_ID = int(os.getenv("GUILD_ID", "1244947057320661043"))
ADMIN_USER_ID = int(os.getenv("ADMIN_USER_ID", "1280926025789870209"))
PANEL_CHANNEL_ID = int(os.getenv("PANEL_CHANNEL_ID", "1469005198700712046"))
HWID_RESET_CHANNEL_ID = int(os.getenv("HWID_RESET_CHANNEL_ID", "1403918366623797268"))
LOADER_ALERT_CHANNEL_ID = int(os.getenv("DISCORD_LOADER_ALERT_CHANNEL_ID", "1373760247658971256"))
STORE_URL = os.getenv("STORE_URL", "https://whosthesource.mysellauth.com")

ALLOWED_ROLE_NAME = os.getenv("ALLOWED_ROLE_NAME", "Admin")
FOUNDER_ROLE_NAME = os.getenv("FOUNDER_ROLE_NAME", "SB | OWNER 💜⚡️")

DISCORD_GUILD = discord.Object(id=GUILD_ID)

PRODUCT_CHOICES = ["CS2", "FiveM", "GTAV", "Warzone", "All-Access"]
GAME_PREFIX_MAP = {
    "CS2": "CS2X",
    "FiveM": "FIVM",
    "GTAV": "GTAV",
    "Warzone": "WARZ",
    "All-Access": "ALLX",
}


intents = discord.Intents.default()
intents.message_content = True
intents.members = True

bot = commands.Bot(command_prefix="!", intents=intents)
tree = bot.tree


def normalize_game_name(value: str) -> str:
    cleaned = str(value or "").strip()
    normalized = cleaned.upper()

    if normalized in {"CS2", "COUNTER-STRIKE 2"}:
        return "CS2"
    if normalized in {"FIVEM", "FIVE M"}:
        return "FiveM"
    if normalized in {"GTAV", "GTA V", "GTA5"}:
        return "GTAV"
    if normalized in {"WARZONE", "COD"}:
        return "Warzone"
    if normalized in {"ALL-ACCESS", "ALL ACCESS", "ALLX"}:
        return "All-Access"
    return cleaned


def apply_duration(base_date: datetime, days_value: float) -> datetime:
    target = base_date
    parsed_days = float(days_value)

    if parsed_days >= 999:
        return target + timedelta(days=50 * 365)

    return target + timedelta(days=parsed_days)


def generate_license_key(game_name: str) -> str:
    prefix = GAME_PREFIX_MAP.get(normalize_game_name(game_name), "GENR")
    random_part = secrets.token_hex(6).upper()
    return f"{prefix}-{random_part[:4]}-{random_part[4:8]}-{random_part[8:12]}"


def build_pending_voucher_email(key: str) -> str:
    return f"pending_{key.lower()}"


def is_pending_voucher(user_doc: Optional[dict]) -> bool:
    email = str((user_doc or {}).get("email") or "").lower()
    return email.startswith("pending_")


def format_expiry(expiry_value) -> str:
    if isinstance(expiry_value, datetime):
        expiry = expiry_value if expiry_value.tzinfo else expiry_value.replace(tzinfo=timezone.utc)
        return expiry.strftime("%Y-%m-%d %H:%M:%S UTC")
    return "Not Set"


def has_admin_access(member: discord.abc.User) -> bool:
    if member.id == ADMIN_USER_ID:
        return True

    if isinstance(member, discord.Member):
        if member.guild_permissions.administrator:
            return True
        role_names = {role.name for role in member.roles}
        if ALLOWED_ROLE_NAME in role_names or FOUNDER_ROLE_NAME in role_names:
            return True

    return False


async def ensure_admin(interaction: discord.Interaction) -> bool:
    if has_admin_access(interaction.user):
        return True

    if interaction.response.is_done():
        await interaction.followup.send("❌ Admin access required.", ephemeral=True)
    else:
        await interaction.response.send_message("❌ Admin access required.", ephemeral=True)
    return False


def build_status_embed(user: dict, discord_user: discord.abc.User) -> discord.Embed:
    expiry = user.get("expiry_date")
    now = datetime.now(timezone.utc)

    if isinstance(expiry, datetime):
        expiry_aware = expiry if expiry.tzinfo else expiry.replace(tzinfo=timezone.utc)
        status_text = "✅ Active" if now < expiry_aware else "❌ Expired"
    else:
        status_text = "🟡 Pending Setup" if is_pending_voucher(user) else "✅ Active (No Expiry Set)"

    games = user.get("games") or ["General"]
    hwid_status = "🔒 Locked" if user.get("hwid") else "🔓 Not Set"
    ban_status = "🚫 BANNED" if user.get("is_banned") else "🟢 CLEAN"

    embed = discord.Embed(
        title="👤 Account Subscription Info",
        color=discord.Color.green() if not user.get("is_banned") else discord.Color.dark_red(),
    )
    embed.add_field(name="🔑 License Key", value=f"`{user.get('license_key') or 'Not Set'}`", inline=False)
    embed.add_field(name="🎮 Product", value=f"`{', '.join(games)}`", inline=True)
    embed.add_field(name="⏳ Status", value=status_text, inline=True)
    embed.add_field(name="🛡️ Account", value=ban_status, inline=True)
    embed.add_field(name="📅 Expires", value=f"`{format_expiry(expiry)}`", inline=False)
    embed.add_field(name="🖥️ HWID Status", value=f"`{hwid_status}`", inline=True)

    if is_pending_voucher(user):
        reserved = user.get("reserved_email") or "No reserved email"
        embed.add_field(
            name="📝 Voucher State",
            value=f"`Pending voucher`\nReserved Email: `{reserved}`",
            inline=False,
        )

    embed.set_footer(text=f"Discord ID: {discord_user.id}")
    embed.set_thumbnail(url=discord_user.display_avatar.url)
    return embed


async def link_license_to_discord(interaction: discord.Interaction, clean_key: str) -> None:
    target_license = users_collection.find_one({"license_key": clean_key})

    if not target_license:
        await interaction.followup.send("❌ This license key does not exist in the database.", ephemeral=True)
        return

    existing_id = str(target_license.get("discord_id") or "").strip()
    if existing_id and existing_id != str(interaction.user.id):
        await interaction.followup.send("❌ This key has already been linked to another Discord user.", ephemeral=True)
        return

    users_collection.update_one(
        {"_id": target_license["_id"]},
        {"$set": {"discord_id": str(interaction.user.id)}},
    )

    if is_pending_voucher(target_license):
        await interaction.followup.send(
            f"✅ Voucher linked to your Discord.\n"
            f"🔑 `{clean_key}`\n"
            f"Use the loader to redeem and activate this voucher on your account.",
            ephemeral=True,
        )
        return

    await interaction.followup.send(
        embed=build_status_embed(target_license, interaction.user),
        ephemeral=True,
    )


class BuyLicenseButton(discord.ui.Button):
    def __init__(self) -> None:
        super().__init__(label="🛒 Buy License", style=discord.ButtonStyle.blurple, custom_id="buy_license_btn")

    async def callback(self, interaction: discord.Interaction) -> None:
        await interaction.response.send_message(STORE_URL, ephemeral=True)


class RedeemKeyModal(discord.ui.Modal, title="Redeem Your License Key"):
    license_input = discord.ui.TextInput(
        label="License Key",
        placeholder="CS2X-XXXX-XXXX-XXXX",
        required=True,
        max_length=64,
    )

    async def on_submit(self, interaction: discord.Interaction) -> None:
        await interaction.response.defer(ephemeral=True)
        clean_key = str(self.license_input.value).strip().upper()
        target_license = users_collection.find_one({"license_key": clean_key})

        if not target_license:
            await interaction.followup.send(f"❌ Key `{clean_key}` not found.", ephemeral=True)
            return

        existing_id = str(target_license.get("discord_id") or "").strip()
        if existing_id and existing_id != str(interaction.user.id):
            await interaction.followup.send("❌ This key is already linked to another Discord account.", ephemeral=True)
            return

        users_collection.update_one(
            {"_id": target_license["_id"]},
            {"$set": {"discord_id": str(interaction.user.id)}},
        )

        if is_pending_voucher(target_license):
            reserved = target_license.get("reserved_email") or "No reserved email"
            await interaction.followup.send(
                f"✅ Voucher linked to your Discord.\n"
                f"🔑 `{clean_key}`\n"
                f"📧 Reserved Email: `{reserved}`\n"
                f"Use the loader to finish redemption and activate time.",
                ephemeral=True,
            )
            return

        await interaction.followup.send(
            f"✅ Linked successfully to `{clean_key}`.\nExpires: `{format_expiry(target_license.get('expiry_date'))}`",
            ephemeral=True,
        )


class RedeemButton(discord.ui.Button):
    def __init__(self) -> None:
        super().__init__(label="🔑 Redeem Key", style=discord.ButtonStyle.green, custom_id="redeem_key_btn")

    async def callback(self, interaction: discord.Interaction) -> None:
        await interaction.response.send_modal(RedeemKeyModal())


class MainPanelView(discord.ui.View):
    def __init__(self) -> None:
        super().__init__(timeout=None)
        self.add_item(BuyLicenseButton())
        self.add_item(RedeemButton())


class HWIDInputModal(discord.ui.Modal, title="HWID Reset Request"):
    key_input = discord.ui.TextInput(
        label="Enter your License Key",
        placeholder="CS2X-XXXX-XXXX-XXXX",
        required=True,
        max_length=64,
    )

    async def on_submit(self, interaction: discord.Interaction) -> None:
        clean_key = str(self.key_input.value).strip().upper()
        user_data = users_collection.find_one({"license_key": clean_key})

        if not user_data:
            await interaction.response.send_message(f"❌ Key `{clean_key}` was not found.", ephemeral=True)
            return

        existing_pending = requests_collection.find_one(
            {"license_key": clean_key, "status": "PENDING"},
            sort=[("date", -1)],
        )
        if existing_pending:
            await interaction.response.send_message("⏳ A reset request is already pending for this key.", ephemeral=True)
            return

        requests_collection.insert_one({
            "hwid": user_data.get("hwid", "N/A"),
            "license_key": clean_key,
            "type": "ADMIN-PANEL_RESET",
            "status": "PENDING",
            "date": datetime.now(timezone.utc),
            "discord_id": str(interaction.user.id),
        })

        users_collection.update_one(
            {"_id": user_data["_id"]},
            {"$set": {"discord_id": str(interaction.user.id)}},
        )

        await interaction.response.send_message(
            f"✅ Reset request created for `{clean_key}`.\nAn admin can now approve it.",
            ephemeral=True,
        )


class HWIDResetView(discord.ui.View):
    def __init__(self) -> None:
        super().__init__(timeout=None)

    @discord.ui.button(label="Reset HWID", style=discord.ButtonStyle.danger, custom_id="reset_hwid_btn")
    async def reset_hwid(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        await interaction.response.send_modal(HWIDInputModal())


class ResetApprovalView(discord.ui.View):
    def __init__(self, request_id: str) -> None:
        super().__init__(timeout=600)
        self.request_id = request_id

    @discord.ui.button(label="Approve", style=discord.ButtonStyle.green)
    async def approve_button(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        if not await ensure_admin(interaction):
            return
        await process_reset_request(interaction, self.request_id, "APPROVED", from_button=True)

    @discord.ui.button(label="Deny", style=discord.ButtonStyle.red)
    async def deny_button(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        if not await ensure_admin(interaction):
            return
        await process_reset_request(interaction, self.request_id, "DENIED", from_button=True)


async def process_reset_request(
    interaction: discord.Interaction,
    request_id: str,
    status: str,
    *,
    from_button: bool = False,
) -> None:
    try:
        object_id = ObjectId(request_id)
    except Exception:
        if from_button:
            await interaction.response.send_message("❌ Invalid request ID.", ephemeral=True)
        else:
            await interaction.followup.send("❌ Invalid request ID.", ephemeral=True)
        return

    request_doc = requests_collection.find_one_and_update(
        {"_id": object_id, "status": "PENDING"},
        {"$set": {"status": status, "resolved_at": datetime.now(timezone.utc)}},
        return_document=ReturnDocument.AFTER,
    )

    if not request_doc:
        message = "⚠️ Request not found or already processed."
        if from_button:
            await interaction.response.send_message(message, ephemeral=True)
        else:
            await interaction.followup.send(message, ephemeral=True)
        return

    license_key = str(request_doc.get("license_key") or "").upper()

    if status == "APPROVED":
        users_collection.update_one({"license_key": license_key}, {"$set": {"hwid": None}})
        content = f"✅ Approved HWID reset for `{license_key}`"
    else:
        content = f"❌ Denied HWID reset for `{license_key}`"

    if from_button:
        await interaction.response.edit_message(content=content, embed=None, view=None)
    else:
        await interaction.followup.send(content, ephemeral=True)


async def replace_panel_message(channel: discord.TextChannel, title: str, embed: discord.Embed, view: discord.ui.View) -> None:
    async for message in channel.history(limit=25):
        if message.author.id != bot.user.id:
            continue
        if any((existing.title or "") == title for existing in message.embeds):
            await message.delete()

    await channel.send(embed=embed, view=view)


async def startup_panel() -> None:
    if not PANEL_CHANNEL_ID:
        return

    panel_channel = bot.get_channel(PANEL_CHANNEL_ID)
    if not isinstance(panel_channel, discord.TextChannel):
        print(f"❌ Panel channel not found: {PANEL_CHANNEL_ID}")
        return

    embed = discord.Embed(
        title="⚡ VEXION License Panel ⚡",
        description="Manage your VEXION key, link your Discord, and check your current account status.",
        color=discord.Color.blurple(),
    )
    embed.add_field(name="🔑 Redeem Key", value="Link a license key to your Discord account.", inline=False)
    embed.add_field(name="🛒 Buy License", value="Open the official store link.", inline=False)
    embed.add_field(name="📄 Quick Tip", value="Use `/status` after redeeming to verify your subscription.", inline=False)
    embed.set_footer(text="VEXION • Secure License Management")

    await replace_panel_message(panel_channel, embed.title or "", embed, MainPanelView())
    print(f"✅ License panel sent in #{panel_channel.name}")


async def send_persistent_hwid_panel() -> None:
    if not HWID_RESET_CHANNEL_ID:
        return

    panel_channel = bot.get_channel(HWID_RESET_CHANNEL_ID)
    if not isinstance(panel_channel, discord.TextChannel):
        print(f"❌ HWID reset channel not found: {HWID_RESET_CHANNEL_ID}")
        return

    embed = discord.Embed(
        title="🛡️ HWID Reset Panel",
        description="Need to switch machines or resolve login issues?\nClick the button below to submit an HWID reset request.",
        color=discord.Color.orange(),
    )
    embed.add_field(
        name="⚠️ Important",
        value="Requests start as pending and must be approved by staff before the HWID is cleared.",
        inline=False,
    )
    embed.set_footer(text="VEXION • Secure HWID Management")

    await replace_panel_message(panel_channel, embed.title or "", embed, HWIDResetView())
    print(f"✅ HWID reset panel sent in #{panel_channel.name}")


@bot.event
async def on_ready() -> None:
    bot.add_view(MainPanelView())
    bot.add_view(HWIDResetView())

    print(f"✅ Bot live as {bot.user}")

    try:
        guild_synced = await bot.tree.sync(guild=DISCORD_GUILD)
        print(f"🏠 Guild synced: {len(guild_synced)} commands")
    except Exception as error:
        print(f"❌ Guild sync failed: {error}")

    await startup_panel()
    await send_persistent_hwid_panel()


@bot.event
async def on_command_error(ctx: commands.Context, error: Exception) -> None:
    print(f"[ERROR] Command {ctx.command} raised {error}")


@tree.command(name="panel", description="Open the main VEXION panel.", guild=DISCORD_GUILD)
async def panel(interaction: discord.Interaction) -> None:
    embed = discord.Embed(title="⚡ VEXION Panel ⚡", color=discord.Color.blurple())
    embed.description = "Use the buttons below to buy or redeem your key."
    await interaction.response.send_message(embed=embed, view=MainPanelView(), ephemeral=True)


@tree.command(name="ping", description="Check bot latency.", guild=DISCORD_GUILD)
async def ping(interaction: discord.Interaction) -> None:
    start = time.perf_counter()
    await interaction.response.send_message("Pinging...", ephemeral=True)
    end = time.perf_counter()
    rtt = (end - start) * 1000
    ws = bot.latency * 1000
    uptime = int(time.time() - BOT_START)
    await interaction.edit_original_response(content=f"🏓 Pong | RTT {rtt:.1f}ms | WS {ws:.1f}ms | Uptime {uptime}s")


@tree.command(name="status", description="Check your license and subscription information.", guild=DISCORD_GUILD)
async def status(interaction: discord.Interaction) -> None:
    user_data = users_collection.find_one({"discord_id": str(interaction.user.id)})

    if not user_data:
        embed = discord.Embed(
            title="❌ No Account Linked",
            description="Your Discord account is not linked to any current key.\nUse `/redeem_key` or the panel button first.",
            color=discord.Color.red(),
        )
        await interaction.response.send_message(embed=embed, ephemeral=True)
        return

    await interaction.response.send_message(embed=build_status_embed(user_data, interaction.user), ephemeral=True)


@tree.command(name="redeem_key", description="Link a license key to your Discord account.", guild=DISCORD_GUILD)
@app_commands.describe(key="Paste your license key here")
async def redeem_key(interaction: discord.Interaction, key: str) -> None:
    await interaction.response.defer(ephemeral=True)
    await link_license_to_discord(interaction, str(key).strip().upper())


@tree.command(name="link", description="Link your license to your Discord account.", guild=DISCORD_GUILD)
@app_commands.describe(key="Paste your license key here")
async def link(interaction: discord.Interaction, key: str) -> None:
    await interaction.response.defer(ephemeral=True)
    await link_license_to_discord(interaction, str(key).strip().upper())


@tree.command(name="genkey", description="Admin: generate a voucher key or pre-register an account.", guild=DISCORD_GUILD)
@app_commands.describe(
    game="Choose the game access tier",
    days="Duration in days (999 for lifetime)",
    email="Optional reserved/pre-register email",
    password="Optional pre-register password",
    pre_register="Create or update the user account before redemption",
)
async def genkey(
    interaction: discord.Interaction,
    game: str,
    days: float = 30.0,
    email: Optional[str] = None,
    password: Optional[str] = None,
    pre_register: bool = False,
) -> None:
    if not await ensure_admin(interaction):
        return

    await interaction.response.defer(ephemeral=True)

    normalized_game = normalize_game_name(game)
    normalized_days = 30.0 if days != days else days
    clean_email = email.lower().strip() if email else ""
    clean_password = password.strip() if password else ""

    if pre_register and not clean_email:
        await interaction.followup.send("❌ Email is required when `pre_register` is enabled.", ephemeral=True)
        return

    new_key = generate_license_key(normalized_game)
    voucher_doc = {
        "license_key": new_key,
        "duration_days": normalized_days,
        "games": [normalized_game],
        "email": build_pending_voucher_email(new_key),
        "password": None,
        "hwid": None,
        "expiry_date": None,
        "reserved_email": clean_email or None,
        "discord_id": "",
        "is_banned": False,
        "is_paused": False,
        "createdAt": datetime.now(timezone.utc),
        "updatedAt": datetime.now(timezone.utc),
    }

    existing_user = users_collection.find_one({"email": clean_email}) if clean_email else None
    account_created = False

    if pre_register:
        if existing_user:
            updates = {"updatedAt": datetime.now(timezone.utc)}
            if not existing_user.get("password") and clean_password:
                updates["password"] = clean_password
            if updates:
                users_collection.update_one({"_id": existing_user["_id"]}, {"$set": updates})
        else:
            users_collection.insert_one({
                "email": clean_email,
                "password": clean_password or None,
                "hwid": None,
                "games": [],
                "expiry_date": None,
                "license_key": None,
                "duration_days": normalized_days,
                "discord_id": "",
                "is_banned": False,
                "is_paused": False,
                "createdAt": datetime.now(timezone.utc),
                "updatedAt": datetime.now(timezone.utc),
            })
            account_created = True

    users_collection.insert_one(voucher_doc)

    mode = (
        "pre-registered new user" if pre_register and account_created
        else "pre-registered existing user" if pre_register
        else "reserved voucher" if clean_email
        else "standalone voucher"
    )

    embed = discord.Embed(
        title="✅ Key Generated",
        color=discord.Color.green(),
        timestamp=datetime.now(timezone.utc),
    )
    embed.add_field(name="🔑 License", value=f"`{new_key}`", inline=False)
    embed.add_field(name="🎮 Game", value=f"`{normalized_game}`", inline=True)
    embed.add_field(name="⏳ Duration", value=f"`{normalized_days}` days", inline=True)
    embed.add_field(name="📦 Mode", value=f"`{mode}`", inline=False)

    if clean_email:
        embed.add_field(name="📧 Email", value=f"`{clean_email}`", inline=False)
    if clean_password:
        embed.add_field(name="🔐 Password", value=f"`{clean_password}`", inline=False)

    await interaction.followup.send(embed=embed, ephemeral=True)


@genkey.autocomplete("game")
async def genkey_game_autocomplete(
    interaction: discord.Interaction,
    current: str,
) -> list[app_commands.Choice[str]]:
    current_lower = current.lower()
    return [
        app_commands.Choice(name=choice, value=choice)
        for choice in PRODUCT_CHOICES
        if current_lower in choice.lower()
    ][:25]


@tree.command(name="announce_loader", description="Admin: send a top-right loader toast notification.", guild=DISCORD_GUILD)
@app_commands.describe(title="Short notification title", message="Main body shown in the loader toast")
async def announce_loader(interaction: discord.Interaction, title: str, message: str) -> None:
    if not await ensure_admin(interaction):
        return

    await interaction.response.defer(ephemeral=True)

    target_channel = bot.get_channel(LOADER_ALERT_CHANNEL_ID)
    if not isinstance(target_channel, discord.TextChannel):
        await interaction.followup.send(f"❌ Loader alert channel not found: `{LOADER_ALERT_CHANNEL_ID}`", ephemeral=True)
        return

    embed = discord.Embed(
        title=title[:240],
        description=message[:3900],
        color=discord.Color.blue(),
        timestamp=datetime.now(timezone.utc),
    )
    embed.set_author(name=interaction.user.display_name, icon_url=interaction.user.display_avatar.url)
    embed.set_footer(text="Loader Admin Notification")

    await target_channel.send(embed=embed)
    await interaction.followup.send(f"✅ Loader announcement sent to <#{LOADER_ALERT_CHANNEL_ID}>.", ephemeral=True)


@tree.command(name="resets", description="Admin: list pending HWID reset requests.", guild=DISCORD_GUILD)
async def resets(interaction: discord.Interaction) -> None:
    if not await ensure_admin(interaction):
        return

    await interaction.response.defer(ephemeral=True)
    pending = list(requests_collection.find({"status": "PENDING"}).sort("date", -1).limit(10))

    if not pending:
        await interaction.followup.send("✅ No pending HWID reset requests.", ephemeral=True)
        return

    for index, request_doc in enumerate(pending):
        raw_date = request_doc.get("date")
        date_text = format_expiry(raw_date)
        embed = discord.Embed(
            title="🛡️ HWID Reset Request",
            color=discord.Color.orange(),
        )
        embed.add_field(name="🔑 License Key", value=f"`{request_doc.get('license_key', 'N/A')}`", inline=False)
        embed.add_field(name="🖥️ Current HWID", value=f"`{request_doc.get('hwid') or request_doc.get('old_hwid') or 'N/A'}`", inline=False)
        if request_doc.get("new_hwid"):
            embed.add_field(name="🆕 Requested HWID", value=f"`{request_doc.get('new_hwid')}`", inline=False)
        embed.add_field(name="🕒 Requested At", value=f"`{date_text}`", inline=False)

        view = ResetApprovalView(str(request_doc["_id"]))
        if index == 0:
            await interaction.followup.send(embed=embed, view=view, ephemeral=True)
        else:
            await interaction.followup.send(embed=embed, view=view, ephemeral=True)


@tree.command(name="approve", description="Admin: approve a pending HWID reset request.", guild=DISCORD_GUILD)
@app_commands.describe(request_id="The MongoDB request ID")
async def approve(interaction: discord.Interaction, request_id: str) -> None:
    if not await ensure_admin(interaction):
        return
    await interaction.response.defer(ephemeral=True, thinking=True)
    await process_reset_request(interaction, request_id, "APPROVED")


@tree.command(name="deny", description="Admin: deny a pending HWID reset request.", guild=DISCORD_GUILD)
@app_commands.describe(request_id="The MongoDB request ID")
async def deny(interaction: discord.Interaction, request_id: str) -> None:
    if not await ensure_admin(interaction):
        return
    await interaction.response.defer(ephemeral=True, thinking=True)
    await process_reset_request(interaction, request_id, "DENIED")


def main() -> None:
    token = os.getenv("DISCORD_TOKEN") or os.getenv("TOKEN")
    if not token:
        raise RuntimeError("DISCORD_TOKEN or TOKEN is required")

    try:
        bot.run(token)
    except discord.LoginFailure:
        print("❌ Invalid Discord token")
    except Exception as error:
        print(f"❌ Bot crashed: {error}")


if __name__ == "__main__":
    main()
