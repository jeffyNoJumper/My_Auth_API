#include "stdafx.h"
#include <windows.h>
#include <stdbool.h>
#include <stdio.h>
#include <tlhelp32.h>
#include <shlobj.h>
#include <shlwapi.h>

// Ensure NtQueryKey is accessible
extern NTQK NtQueryKey;

bool run_user_spoof() {
    srand(GetTickCount());

    // Setup ntdll
    HMODULE ntdll = GetModuleHandle(L"ntdll.dll");
    if (!ntdll) ntdll = LoadLibrary(L"ntdll.dll");
    if (ntdll) {
        NtQueryKey = (NTQK)GetProcAddress(ntdll, "NtQueryKey");
    }

    if (!AdjustCurrentPrivilege(SE_TAKE_OWNERSHIP_NAME)) {
        printf("Debug: Privilege adjustment failed. Error: %d\n", GetLastError());
        return false;
    }

    // --- REGISTRY LOGIC ---

    // Monitors
    OpenThen(HKEY_LOCAL_MACHINE, L"SYSTEM\\CurrentControlSet\\Enum\\DISPLAY", {
        ForEachSubkey(key, {
            OpenThen(key, name, {
                ForEachSubkey(key, {
                    OpenThen(key, name, {
                        ForEachSubkey(key, {
                            if (_wcsicmp(name, L"device parameters") == 0) {
                                SpoofBinary(key, name, L"EDID");
                            }
                        });
                    });
                });
            });
        });
        });

    // SMBIOS & Motherboard
    DeleteValue(HKEY_LOCAL_MACHINE, L"SYSTEM\\CurrentControlSet\\Services\\mssmbios\\Data", L"SMBiosData");

    SpoofUniqueThen(HKEY_LOCAL_MACHINE, L"SYSTEM\\HardwareConfig", L"LastConfig", {
        ForEachSubkey(key, {
            if (_wcsicmp(name, L"current") != 0) {
                RenameSubkey(key, name, spoof);
            }
        });
        });

    // SMBIOS & Motherboard
    DeleteValue(HKEY_LOCAL_MACHINE, L"SYSTEM\\CurrentControlSet\\Services\\mssmbios\\Data", L"SMBiosData");

    // Add this to patch the BIOS/Baseboard strings
    OpenThen(HKEY_LOCAL_MACHINE, L"HARDWARE\\DESCRIPTION\\System\\BIOS", {
        KeySpoofUnique(key, L"BaseBoardSerialNumber");
        KeySpoofUnique(key, L"SystemSerialNumber");
        KeySpoofUnique(key, L"SystemSKU");
        });

    // NVIDIA
    SpoofUnique(HKEY_LOCAL_MACHINE, L"SOFTWARE\\NVIDIA Corporation\\Global", L"ClientUUID");
    SpoofUnique(HKEY_LOCAL_MACHINE, L"SOFTWARE\\NVIDIA Corporation\\Global", L"PersistenceIdentifier");
    DeleteKey(HKEY_LOCAL_MACHINE, L"SYSTEM\\MountedDevices");

    // Windows IDs
    SpoofUnique(HKEY_LOCAL_MACHINE, L"SOFTWARE\\Microsoft\\Cryptography", L"MachineGuid");
    SpoofUnique(HKEY_LOCAL_MACHINE, L"SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion", L"ProductId");

    // Misc
    SpoofUnique(HKEY_LOCAL_MACHINE, L"SYSTEM\\CurrentControlSet\\Control\\SystemInformation", L"ComputerHardwareId");
    SpoofUniques(HKEY_LOCAL_MACHINE, L"SYSTEM\\CurrentControlSet\\Control\\SystemInformation", L"ComputerHardwareIds");

    // Network
    OpenThen(HKEY_LOCAL_MACHINE, L"SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e972-e325-11ce-bfc1-08002be10318}", {
        ForEachSubkey(key, {
            if (_wcsicmp(name, L"configuration") != 0 && _wcsicmp(name, L"properties") != 0) {
                DeleteValue(key, name, L"NetworkAddress");
                SpoofQWORD(key, name, L"NetworkInterfaceInstallTimestamp");
            }
        });
        });

    // UEFI / ESRT
    OpenThen(HKEY_LOCAL_MACHINE, L"HARDWARE\\UEFI\\ESRT", {
        WCHAR subkeys[0xFF][MAX_PATH] = { 0 };
        DWORD subkeys_length = 0;
        ForEachSubkey(key, {
            if (subkeys_length < 0xFF) {
                wcscpy(subkeys[subkeys_length++], name);
            }
        });
        for (DWORD i = 0; i < subkeys_length; ++i) {
            WCHAR uefi_spoof[MAX_PATH] = { 0 };
            wcscpy(uefi_spoof, subkeys[i]);
            OutSpoofUnique(uefi_spoof);
            RenameSubkey(key, subkeys[i], uefi_spoof);
        }
        });

        // --- FINAL CLEANUP ---
    // Kill providers first to prevent the "Service Busy" lock
    WinExec("taskkill /F /IM WmiPrvSE.exe /T", SW_HIDE);

    // Now stop the service to finalize registry flushing
    WinExec("net stop winmgmt /Y", SW_HIDE);

    return true;
}

