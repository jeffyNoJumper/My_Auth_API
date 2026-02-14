#include <windows.h>
#include <stdbool.h>
#include <stdio.h>

// Helper to ensure we have Admin rights (required for Kernel access)
bool IsAdmin() {
    BOOL isAdmin = FALSE;
    PSID adminGroup;
    SID_IDENTIFIER_AUTHORITY ntAuthority = SECURITY_NT_AUTHORITY;
    if (AllocateAndInitializeSid(&ntAuthority, 2, SECURITY_BUILTIN_DOMAIN_RID, DOMAIN_ALIAS_RID_ADMINS, 0, 0, 0, 0, 0, 0, &adminGroup)) {
        CheckTokenMembership(NULL, adminGroup, &isAdmin);
        FreeSid(adminGroup);
    }
    return isAdmin;
}

bool run_kernel_spoof() {
    if (!IsAdmin()) return false;

    const char* driverPath = "C:\\path\\to\\your\\compiled_driver.sys"; // UPDATE THIS PATH
    const char* svcName = "DiskSpooferSvc";

    SC_HANDLE scm = OpenSCManagerA(NULL, NULL, SC_MANAGER_ALL_ACCESS);
    if (!scm) return false;

    SC_HANDLE svc = CreateServiceA(scm, svcName, svcName, SERVICE_ALL_ACCESS,
        SERVICE_KERNEL_DRIVER, SERVICE_DEMAND_START,
        SERVICE_ERROR_NORMAL, driverPath, NULL, NULL, NULL, NULL, NULL);

    if (!svc && GetLastError() == ERROR_SERVICE_EXISTS) {
        svc = OpenServiceA(scm, svcName, SERVICE_ALL_ACCESS);
    }

    bool success = false;
    if (svc) {
        // This starts the DriverEntry in your driver.c
        if (StartServiceA(svc, 0, NULL) || GetLastError() == ERROR_SERVICE_ALREADY_RUNNING) {
            success = true;
        }
        CloseServiceHandle(svc);
    }

    CloseServiceHandle(scm);
    return success;
}
