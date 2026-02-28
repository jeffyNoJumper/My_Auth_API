#include "stdafx.h"
#include <windows.h>
#include <stdbool.h>
#include <stdio.h>
#include <tlhelp32.h>
#include <shlobj.h>
#include <shlwapi.h>

// Ensure NtQueryKey is accessible
extern NTQK NtQueryKey;

static bool StopWMI(void);

bool run_user_spoof(const char* motherboard, bool biosFlash, bool cleanReg)
{
    srand(GetTickCount());

    // Motherboard Handling Logic
    if (motherboard &&
        motherboard[0] != '\0' &&
        strcmp(motherboard, "Other") != 0)
    {
        char board[64] = { 0 };

        for (int i = 0; motherboard[i] && i < 63; i++)
            board[i] = (char)toupper((unsigned char)motherboard[i]);

        printf("[SPOOFER] Motherboard detected: %s\n", board);

        // ASUS
        if (strcmp(board, "ASUS") == 0)
        {
            printf("[SPOOFER] Applying ASUS patches...\n");

            OpenThen(HKEY_LOCAL_MACHINE,
                L"HARDWARE\\DESCRIPTION\\System\\BIOS",
                {
                    KeySpoofUnique(key, L"BaseBoardProduct");
                    KeySpoofUnique(key, L"BaseBoardManufacturer");
                });

            DeleteValue(
                HKEY_LOCAL_MACHINE,
                L"SYSTEM\\CurrentControlSet\\Services\\AsusCertService",
                L"Certificate"
            );
        }

        // MSI
        else if (strcmp(board, "MSI") == 0)
        {
            printf("[SPOOFER] Applying MSI patches...\n");

            OpenThen(HKEY_LOCAL_MACHINE,
                L"HARDWARE\\DESCRIPTION\\System\\BIOS",
                {
                    KeySpoofUnique(key, L"SystemProductName");
                    KeySpoofUnique(key, L"BIOSVersion");
                });

            DeleteKey(
                HKEY_LOCAL_MACHINE,
                L"SOFTWARE\\MSI"
            );
        }

        // GIGABYTE
        else if (strcmp(board, "GIGABYTE") == 0)
        {
            printf("[SPOOFER] Applying GIGABYTE patches...\n");

            DeleteKey(
                HKEY_LOCAL_MACHINE,
                L"SOFTWARE\\Gigabyte"
            );

            OpenThen(HKEY_LOCAL_MACHINE,
                L"HARDWARE\\DESCRIPTION\\System\\BIOS",
                {
                    KeySpoofUnique(key, L"BaseBoardVersion");
                });
        }

        // GENERIC FALLBACK
        else
        {
            printf("[SPOOFER] Applying generic motherboard spoof...\n");

            OpenThen(HKEY_LOCAL_MACHINE,
                L"HARDWARE\\DESCRIPTION\\System\\BIOS",
                {
                    KeySpoofUnique(key, L"BaseBoardSerialNumber");
                    KeySpoofUnique(key, L"SystemManufacturer");
                });
        }

    // BIOS Flash Logic
    if (biosFlash)
    {
        printf("[SPOOFER] BIOS flash requested\n");
        // WinExec("assets\\flash_utility.exe", SW_HIDE);
    }

    // Registry Cleaning
    if (cleanReg)
    {
        HMODULE ntdll = GetModuleHandle(L"ntdll.dll");
        if (!ntdll)
            ntdll = LoadLibrary(L"ntdll.dll");

        if (ntdll)
            NtQueryKey = (NTQK)GetProcAddress(ntdll, "NtQueryKey");

        if (!AdjustCurrentPrivilege(SE_TAKE_OWNERSHIP_NAME))
        {
            printf(
                "Debug: Privilege adjustment failed. Error: %lu\n",
                GetLastError()
            );
        }
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

        // BIOS/Baseboard strings
        OpenThen(HKEY_LOCAL_MACHINE, L"HARDWARE\\DESCRIPTION\\System\\BIOS", {
            KeySpoofUnique(key, L"BaseBoardSerialNumber");
            KeySpoofUnique(key, L"SystemSerialNumber");
            KeySpoofUnique(key, L"SystemSKU");
            });

        // NVIDIA / Windows IDs
        SpoofUnique(HKEY_LOCAL_MACHINE, L"SOFTWARE\\NVIDIA Corporation\\Global", L"ClientUUID");
        SpoofUnique(HKEY_LOCAL_MACHINE, L"SOFTWARE\\NVIDIA Corporation\\Global", L"PersistenceIdentifier");
        DeleteKey(HKEY_LOCAL_MACHINE, L"SYSTEM\\MountedDevices");
        SpoofUnique(HKEY_LOCAL_MACHINE, L"SOFTWARE\\Microsoft\\Cryptography", L"MachineGuid");
        SpoofUnique(HKEY_LOCAL_MACHINE, L"SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion", L"ProductId");

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
        StopWMI();
    }

    return true; // Successfully finished the function
}

static bool StopWMI(void)
{
    SC_HANDLE scm =
        OpenSCManager(NULL, NULL, SC_MANAGER_CONNECT);

    if (!scm) return false;

    SC_HANDLE svc =
        OpenService(scm, L"winmgmt",
            SERVICE_STOP | SERVICE_QUERY_STATUS);

    if (!svc) {
        CloseServiceHandle(scm);
        return false;
    }

    SERVICE_STATUS_PROCESS ssp;
    DWORD bytesNeeded;

    QueryServiceStatusEx(
        svc,
        SC_STATUS_PROCESS_INFO,
        (LPBYTE)&ssp,
        sizeof(ssp),
        &bytesNeeded
    );

    // Already stopping/stopped
    if (ssp.dwCurrentState == SERVICE_STOPPED ||
        ssp.dwCurrentState == SERVICE_STOP_PENDING)
    {
        CloseServiceHandle(svc);
        CloseServiceHandle(scm);
        return true;
    }

    ControlService(
        svc,
        SERVICE_CONTROL_STOP,
        (LPSERVICE_STATUS)&ssp
    );

    // WAIT until stopped
    do {
        Sleep(500);

        QueryServiceStatusEx(
            svc,
            SC_STATUS_PROCESS_INFO,
            (LPBYTE)&ssp,
            sizeof(ssp),
            &bytesNeeded
        );

    } while (ssp.dwCurrentState != SERVICE_STOPPED);

    CloseServiceHandle(svc);
    CloseServiceHandle(scm);

    return true;
}
