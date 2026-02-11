#include <windows.h>
#include <iostream>
#include <string>
#include <random>
#include <vector>

// Helper to generate truly random alphanumeric strings
std::string GenerateRandomString(int length) {
    const std::string charset = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dist(0, charset.size() - 1);

    std::string result;
    for (int i = 0; i < length; ++i) result += charset[dist(gen)];
    return result;
}

// Helper to generate a random GUID (Format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
std::string GenerateRandomGUID() {
    const std::string hex = "0123456789abcdef";
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dist(0, 15);

    auto gen_hex = [&](int len) {
        std::string s;
        for (int i = 0; i < len; ++i) s += hex[dist(gen)];
        return s;
    };

    return gen_hex(8) + "-" + gen_hex(4) + "-" + gen_hex(4) + "-" + gen_hex(4) + "-" + gen_hex(12);
}

// 1. Spoof Disk Serial in Registry
bool SpoofDisk() {
    HKEY hKey;
    const char* path = "HARDWARE\\DEVICEMAP\\Scsi\\Scsi Port 0\\Scsi Bus 0\\Target Id 0\\Logical Unit Id 0";
    if (RegOpenKeyExA(HKEY_LOCAL_MACHINE, path, 0, KEY_SET_VALUE, &hKey) == ERROR_SUCCESS) {
        std::string newSerial = GenerateRandomString(16);
        RegSetValueExA(hKey, "SerialNumber", 0, REG_SZ, (const BYTE*)newSerial.c_str(), newSerial.length());
        RegCloseKey(hKey);
        return true;
    }
    return false;
}

// 2. Spoof Machine GUID
bool SpoofGUID() {
    HKEY hKey;
    const char* path = "SOFTWARE\\Microsoft\\Cryptography";
    if (RegOpenKeyExA(HKEY_LOCAL_MACHINE, path, 0, KEY_SET_VALUE, &hKey) == ERROR_SUCCESS) {
        std::string newGuid = GenerateRandomGUID();
        RegSetValueExA(hKey, "MachineGuid", 0, REG_SZ, (const BYTE*)newGuid.c_str(), newGuid.length());
        RegCloseKey(hKey);
        return true;
    }
    return false;
}

// 3. Spoof MAC Address (Registry Method)
// Note: Requires adapter restart to apply
bool SpoofMAC() {
    HKEY hKey;
    // Common path for network adapters
    const char* path = "SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e972-e325-11ce-bfc1-08002be10318}\\0001";
    if (RegOpenKeyExA(HKEY_LOCAL_MACHINE, path, 0, KEY_SET_VALUE, &hKey) == ERROR_SUCCESS) {
        // Random 12-digit hex (Second digit must be 2, 6, A, or E for compatibility)
        std::string newMAC = "02" + GenerateRandomString(10); 
        RegSetValueExA(hKey, "NetworkAddress", 0, REG_SZ, (const BYTE*)newMAC.c_str(), newMAC.length());
        RegCloseKey(hKey);
        return true;
    }
    return false;
}

int main() {
    std::cout << "[+] Initializing HWID Spoofing..." << std::endl;
    
    if (SpoofDisk()) std::cout << "[SUCCESS] Disk Serial Spoofed." << std::endl;
    if (SpoofGUID()) std::cout << "[SUCCESS] Machine GUID Spoofed." << std::endl;
    if (SpoofMAC())  std::cout << "[SUCCESS] MAC Address Queued (Requires Restart)." << std::endl;

    std::cout << "[!] All operations finished." << std::endl;
    return 0;
}
