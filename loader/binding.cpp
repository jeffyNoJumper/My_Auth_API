#include <napi.h>
#include <windows.h>
#include <string>
#include <random>
#include <cstdio>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <array>

extern "C" {
    bool run_user_spoof();
    bool run_kernel_spoof();
}

// --- NEW SYSTEM INFO HELPERS ---

// Executes a shell command and returns the output string
std::string exec(const char* cmd) {
    std::array<char, 128> buffer;
    std::string result;
    std::unique_ptr<FILE, decltype(&_pclose)> pipe(_popen(cmd, "r"), _pclose);
    if (!pipe) return "N/A";
    while (fgets(buffer.data(), buffer.size(), pipe.get()) != nullptr) {
        result += buffer.data();
    }
    // Clean up whitespace/newlines
    result.erase(result.find_last_not_of(" \n\r\t") + 1);
    return result;
}

std::string GetMachineID() {
    HKEY hKey;
    char buffer[256];
    DWORD dwSize = sizeof(buffer);

    if (RegOpenKeyExA(HKEY_LOCAL_MACHINE, "SOFTWARE\\Microsoft\\Cryptography", 0, KEY_READ | KEY_WOW64_64KEY, &hKey) == ERROR_SUCCESS) {
        // Read the "MachineGuid" value
        if (RegQueryValueExA(hKey, "MachineGuid", NULL, NULL, (LPBYTE)buffer, &dwSize) == ERROR_SUCCESS) {
            RegCloseKey(hKey);
            return std::string(buffer);
        }
        RegCloseKey(hKey);
    }

    return "UNKNOWN_ID";
}


// --- N-API WRAPPERS FOR DYNAMIC UI ---

Napi::Value GetBaseboardSerial(const Napi::CallbackInfo& info) {
    HKEY hKey;
    char buffer[256] = { 0 }; // Initialize with zeros
    DWORD dwSize = sizeof(buffer);

    if (RegOpenKeyExA(HKEY_LOCAL_MACHINE, "HARDWARE\\DESCRIPTION\\System\\BIOS", 0, KEY_READ | KEY_WOW64_64KEY, &hKey) == ERROR_SUCCESS) {
        if (RegQueryValueExA(hKey, "BaseBoardSerialNumber", NULL, NULL, (LPBYTE)buffer, &dwSize) == ERROR_SUCCESS) {
            RegCloseKey(hKey);
            return Napi::String::New(info.Env(), buffer);
        }
        RegCloseKey(hKey);
    }
    return Napi::String::New(info.Env(), "SERIAL-UNKNOWN");
}

Napi::Value GetGPUID(const Napi::CallbackInfo& info) {
    std::string out = exec("wmic path win32_VideoController get PNPDeviceID /value");
    size_t pos = out.find('=');
    return Napi::String::New(info.Env(), pos != std::string::npos ? out.substr(pos + 1) : "GPU-UNKNOWN");
}


// --- SPOOFER LOGIC ---
/*
std::string GenerateRandomString(int length) {
    const std::string charset = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dist(0, (int)charset.size() - 1);
    std::string result;
    for (int i = 0; i < length; ++i) result += charset[dist(gen)];
    return result;
}
*/

bool SpoofDisk() {
    HKEY hKey;
    const char* path = "HARDWARE\\DEVICEMAP\\Scsi\\Scsi Port 0\\Scsi Bus 0\\Target Id 0\\Logical Unit Id 0";
    if (RegOpenKeyExA(HKEY_LOCAL_MACHINE, path, 0, KEY_SET_VALUE | KEY_WOW64_64KEY, &hKey) == ERROR_SUCCESS) {
        std::string newSerial = GenerateRandomString(16);
        RegSetValueExA(hKey, "SerialNumber", 0, REG_SZ, (const BYTE*)newSerial.c_str(), (DWORD)newSerial.length());
        RegCloseKey(hKey);
        return true;
    }
    return false;
}

class SpoofWorker : public Napi::AsyncWorker {
public:
    SpoofWorker(Napi::Function& callback)
        : Napi::AsyncWorker(callback), uStatus(false), kStatus(false), dStatus(false) {}

    void Execute() override {
        uStatus = run_user_spoof();
        kStatus = run_kernel_spoof();
        dStatus = SpoofDisk();
    }

    void OnOK() override {
        Napi::HandleScope scope(Env());
        Napi::Object res = Napi::Object::New(Env());
        res.Set("User", Napi::Boolean::New(Env(), uStatus));
        res.Set("Kernel", Napi::Boolean::New(Env(), kStatus));
        res.Set("disk", Napi::Boolean::New(Env(), dStatus));
        res.Set("guid", Napi::Boolean::New(Env(), uStatus));
        res.Set("mac", Napi::Boolean::New(Env(), true));
        Callback().Call({ Env().Null(), res });
    }

private:
    bool uStatus, kStatus, dStatus;
};

Napi::Value RunSpooferAsync(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsFunction()) {
        Napi::TypeError::New(env, "A callback function is required").ThrowAsJavaScriptException();
        return env.Null();
    }
    Napi::Function cb = info[0].As<Napi::Function>();
    SpoofWorker* worker = new SpoofWorker(cb);
    worker->Queue();
    return env.Undefined();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("getMachineID", Napi::Function::New(env, [](const Napi::CallbackInfo& info) {
        return Napi::String::New(info.Env(), GetMachineID());
        }));
    exports.Set("getBaseboard", Napi::Function::New(env, GetBaseboardSerial));
    exports.Set("getGPUID", Napi::Function::New(env, GetGPUID));
    exports.Set("runSpoofer", Napi::Function::New(env, RunSpooferAsync));
    exports.Set("launchCheat", Napi::Function::New(env, [](const Napi::CallbackInfo& info) {
        return Napi::Boolean::New(info.Env(), true);
        }));
    return exports;
}

NODE_API_MODULE(spoofer, Init)
