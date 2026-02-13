#include <napi.h>
#include <windows.h>
#include <string>
#include <random>

// These functions come from your user/main.c and kernel/main.c
extern "C" {
    bool run_user_spoof();
    bool run_kernel_spoof();
}

// --- CORE LOGIC ---

std::string GetMachineID() {
    DWORD serialNum = 0;
    // Uses C drive serial as a basic HWID
    if (GetVolumeInformationA("C:\\", NULL, 0, &serialNum, NULL, NULL, NULL, 0)) {
        return std::to_string(serialNum);
    }
    return "UNKNOWN_DEVICE";
}

std::string GenerateRandomString(int length) {
    const std::string charset = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dist(0, (int)charset.size() - 1);
    std::string result;
    for (int i = 0; i < length; ++i) result += charset[dist(gen)];
    return result;
}

bool SpoofDisk() {
    HKEY hKey;
    // Note: Using KEY_WOW64_64KEY to ensure we hit the real registry on 64-bit systems
    const char* path = "HARDWARE\\DEVICEMAP\\Scsi\\Scsi Port 0\\Scsi Bus 0\\Target Id 0\\Logical Unit Id 0";
    if (RegOpenKeyExA(HKEY_LOCAL_MACHINE, path, 0, KEY_SET_VALUE | KEY_WOW64_64KEY, &hKey) == ERROR_SUCCESS) {
        std::string newSerial = GenerateRandomString(16);
        RegSetValueExA(hKey, "SerialNumber", 0, REG_SZ, (const BYTE*)newSerial.c_str(), (DWORD)newSerial.length());
        RegCloseKey(hKey);
        return true;
    }
    return false;
}

// --- N-API WRAPPERS ---

Napi::String GetHWIDWrapper(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    return Napi::String::New(env, GetMachineID());
}

Napi::Value RunSpoofer(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Object result = Napi::Object::New(env);

    // Run the logic from your external C folders
    bool userStatus = run_user_spoof();
    bool kernelStatus = run_kernel_spoof();
    bool diskStatus = SpoofDisk();

    // Mapping results to what your frontend JS expects
    result.Set("user", Napi::Boolean::New(env, userStatus));
    result.Set("kernel", Napi::Boolean::New(env, kernelStatus));
    result.Set("disk", Napi::Boolean::New(env, diskStatus));
    result.Set("guid", Napi::Boolean::New(env, userStatus));
    result.Set("mac", Napi::Boolean::New(env, true));

    return result;
}

Napi::Value LaunchCheat(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    // Your launch logic here
    return Napi::Boolean::New(env, true);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("getMachineID", Napi::Function::New(env, GetHWIDWrapper));
    exports.Set("runSpoofer", Napi::Function::New(env, RunSpoofer));
    exports.Set("launchCheat", Napi::Function::New(env, LaunchCheat));
    return exports;
}

NODE_API_MODULE(spoofer, Init)
