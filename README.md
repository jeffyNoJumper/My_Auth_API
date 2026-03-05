# SOLOKNIGHT AIO Loader ![MIT License](https://img.shields.io/badge/License-MIT-green)

**Version:** 1.0.5-Beta  
**Author:** SRC DEV

---

## 🚀 Overview
SOLOKNIGHT is a modular game loader and mod menu for supported titles, including:

- **CS2**
- **COD**
- **Fortnite**
- **GTA V Story Mode**

Built with **C# WinForms** for the frontend and a **C++ DLL** for injection and low-level system interactions, SOLOKNIGHT combines sleek design, powerful features, and hardware-level spoofing for security and privacy.

---

## 🎨 Features

### User Interface
- Modern multi-tab layout: **Home**, **Games**, **Spoofer**, **HWID**, **Settings**
- Dynamic news feed with typewriter effect
- Animated game cards with rotating images every 3 seconds
- Interactive terminal interface for commands and logs
- Clean, responsive **WinForms + ImGui overlay**

*Example UI Screenshot:*  
![UI Screenshot](examples/ui.PNG)

### Game Support
- CS2 DLL & External injection
- COD & Fortnite injection modules
- Auto-launch & auto-close options for convenience

*Game Cards Animation Example:*  
![Game Card Animation 1](examples/game-card.PNG)  
![Game Card Animation 2](examples/game-card1.PNG)

### Security & Spoofing
- Permanent HWID spoofing via motherboard/serial modification
- Temporary trace cleaner for session-based spoofing
- Stream proof mode hides visuals for safe streaming
- Integrated terminal logs for spoofing and hardware status

*Spoofer / HWID Example Screenshots:*  
![Spoofer Example](examples/spoofer.PNG)
![HWID Example](examples/HWID.PNG)

### Account & Authentication
- License key authentication with server verification
- Profile picture sync via backend API
- HWID reset requests
- Discord Rich Presence support

*Registration / Account Screenshots:*
![Registration Example](examples/register_account.PNG)
![Session Expired Example](examples/session_expired.PNG)

### Updater
- Automatic update notifications
- Download progress bar for updates
- Integrated news feed during updates

*Updater Overlay Example:*  
![Updater Overlay](examples/updater-overlay.png)

---

## 🛠 Installation
1. Clone or download the repository:

```bash
git clone https://github.com/yourusername/My_Auth_API.git
cd soloknight-loader
