#include <windows.h>
#include <iostream>
#include <string>
#include <random>
#include <vector>

// NEW: This is what your Login screen uses to identify the PC
std::string GetMachineID() {
    DWORD serialNum = 0;
    // Fetches the unique serial of the C: drive
    if (GetVolumeInformationA("C:\\", NULL, 0, &serialNum, NULL, NULL, NULL, 0)) {
        return std::to_string(serialNum);
    }
    return "UNKNOWN_DEVICE";
}

// Helper to generate truly random alphanumeric strings
std::string GenerateRandomString(int length) {
    const std::string charset = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dist(0, (int)charset.size() - 1);

    std::string result;
    for (int i = 0; i < length; ++i) result += charset[dist(gen)];
    return result;
}

// Helper to generate a random GUID
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
        RegSetValueExA(hKey, "SerialNumber", 0, REG_SZ, (const BYTE*)newSerial.c_str(), (DWORD)newSerial.length());
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
        RegSetValueExA(hKey, "MachineGuid", 0, REG_SZ, (const BYTE*)newGuid.c_str(), (DWORD)newGuid.length());
        RegCloseKey(hKey);
        return true;
    }
    return false;
}

// 3. Spoof MAC Address
bool SpoofMAC() {
    HKEY hKey;
    const char* path = "SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e972-e325-11ce-bfc1-08002be10318}\\0001";
    if (RegOpenKeyExA(HKEY_LOCAL_MACHINE, path, 0, KEY_SET_VALUE, &hKey) == ERROR_SUCCESS) {
        std::string newMAC = "02" + GenerateRandomString(10); 
        RegSetValueExA(hKey, "NetworkAddress", 0, REG_SZ, (const BYTE*)newMAC.c_str(), (DWORD)newMAC.length());
        RegCloseKey(hKey);
        return true;
    }
    return false;
}
