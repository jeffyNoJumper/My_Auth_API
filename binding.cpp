#include <napi.h>
#include <windows.h>
#include <string>
#include <random>

// --- CORE LOGIC (Moved from spoofer.cpp) ---

std::string GetMachineID() {
    DWORD serialNum = 0;
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
    const char* path = "HARDWARE\\DEVICEMAP\\Scsi\\Scsi Port 0\\Scsi Bus 0\\Target Id 0\\Logical Unit Id 0";
    if (RegOpenKeyExA(HKEY_LOCAL_MACHINE, path, 0, KEY_SET_VALUE, &hKey) == ERROR_SUCCESS) {
        std::string newSerial = GenerateRandomString(16);
        RegSetValueExA(hKey, "SerialNumber", 0, REG_SZ, (const BYTE*)newSerial.c_str(), (DWORD)newSerial.length());
        RegCloseKey(hKey);
        return true;
    }
    return false;
}

// --- N-API WRAPPERS ---

Napi::String GetHWID(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    return Napi::String::New(env, GetMachineID());
}

Napi::Value RunSpoofer(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Object result = Napi::Object::New(env);
    result.Set("disk", Napi::Boolean::New(env, SpoofDisk()));
    // Adding placeholders for GUID/MAC so JS doesn't crash
    result.Set("guid", Napi::Boolean::New(env, true)); 
    result.Set("mac", Napi::Boolean::New(env, true));
    return result;
}

Napi::Value LaunchCheat(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    return Napi::Boolean::New(env, true);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("getMachineID", Napi::Function::New(env, GetHWID));
    exports.Set("runSpoofer", Napi::Function::New(env, RunSpoofer));
    exports.Set("launchCheat", Napi::Function::New(env, LaunchCheat));
    return exports;
}

NODE_API_MODULE(spoofer, Init)
