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
    bool run_kernel_spoof();#include <napi.h>
#include <windows.h>
#include <string>
#include <random>
#include <cstdio>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <array>
#include <shellapi.h>

extern "C" {
    bool run_user_spoof(const char* motherboard, bool biosFlash, bool cleanReg);
    bool run_kernel_spoof();
}

// --- HELPER FUNCTIONS ---

std::string GenerateRandomString(int length) {
    const std::string charset = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dist(0, (int)charset.size() - 1);
    std::string result;
    for (int i = 0; i < length; ++i) result += charset[dist(gen)];
    return result;
}

std::string exec(const char* cmd) {
    std::string result = "";
    char buffer[128];
    // Open pipe to the command
    std::unique_ptr<FILE, decltype(&_pclose)> pipe(_popen(cmd, "r"), _pclose);

    if (!pipe) return "";

    // Read the output line by line
    while (fgets(buffer, sizeof(buffer), pipe.get()) != nullptr) {
        for (int i = 0; buffer[i] != '\0'; ++i) {
            // ONLY keep printable ASCII (33 to 126)
            // This strips hidden null bytes (UTF-16 ghosts) and whitespace
            if (buffer[i] >= 33 && buffer[i] <= 126) {
                result += buffer[i];
            }
        }
    }

    // Scrub common headers if they are stuck to the string
    const std::string headers[] = { "SerialNumber", "UUID" };
    for (const std::string& h : headers) {
        size_t pos = result.find(h);
        if (pos != std::string::npos) {
            result.erase(pos, h.length());
        }
    }

    return result;
}


std::string GetMachineID() {
    HKEY hKey;
    char buffer[256];
    DWORD dwSize = sizeof(buffer);
    if (RegOpenKeyExA(HKEY_LOCAL_MACHINE, "SOFTWARE\\Microsoft\\Cryptography", 0, KEY_READ | KEY_WOW64_64KEY, &hKey) == ERROR_SUCCESS) {
        if (RegQueryValueExA(hKey, "MachineGuid", NULL, NULL, (LPBYTE)buffer, &dwSize) == ERROR_SUCCESS) {
            RegCloseKey(hKey);
            return std::string(buffer);
        }
        RegCloseKey(hKey);
    }
    return "UNKNOWN_ID";
}

// --- CHEAT LAUNCHER LOGIC ---

bool LaunchExternal(const std::string& path) {
    // Standard launch for standalone EXEs
    return (int)ShellExecuteA(NULL, "open", path.c_str(), NULL, NULL, SW_SHOWNORMAL) > 32;
}

bool LaunchInjector(const std::string& gameName, const std::string& dllPath) {
    std::string injectorPath = "C:\\Users\\mac98\\Desktop\\Devs Projects\\Simple Dll Injector\\Extreme Injector v3.exe";

    std::string injectorDir = "C:\\Users\\mac98\\Desktop\\Devs Projects\\Simple Dll Injector\\";

    std::string parameters = "-p cs2.exe -l \"" + dllPath + "\"";

    HINSTANCE res = ShellExecuteA(
        NULL,
        "open",
        injectorPath.c_str(),
        parameters.c_str(),
        injectorDir.c_str(), // <--- This loads your saved settings/config
        SW_HIDE              // Use SW_HIDE now if you want it silent
    );

    return (reinterpret_cast<INT_PTR>(res) > 32);
}



Napi::Value LaunchCheat(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 3) {
        Napi::TypeError::New(env, "Wrong number of arguments").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string game = info[0].As<Napi::String>();
    std::string type = info[1].As<Napi::String>();
    std::string path = info[2].As<Napi::String>();

    bool result = false;
    if (type == "external") {
        result = LaunchExternal(path);
    }
    else if (type == "dll") {
        result = LaunchInjector(game, path);
    }

    return Napi::Boolean::New(env, result);
}

// --- SPOOFER & SYSTEM INFO ---

Napi::Value GetBaseboardSerial(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Try Command 1: Baseboard (Your primary serial)
    std::string serial = exec("wmic baseboard get serialnumber");

    // Validate result (must be longer than a filler string like "None")
    if (serial.length() > 3 && serial.find("None") == std::string::npos) {
        return Napi::String::New(env, serial);
    }

    // Try Command 2: BIOS (Your secondary serial)
    serial = exec("wmic bios get serialnumber");
    if (serial.length() > 3 && serial.find("None") == std::string::npos) {
        return Napi::String::New(env, serial);
    }

    return Napi::String::New(env, "SERIAL-UNKNOWN");
}

Napi::Value GetGPUID(const Napi::CallbackInfo& info) {
    std::string out = exec("wmic path win32_VideoController get PNPDeviceID /value");
    size_t pos = out.find('=');
    return Napi::String::New(info.Env(), pos != std::string::npos ? out.substr(pos + 1) : "GPU-UNKNOWN");
}

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
    SpoofWorker(Napi::Function& callback, std::string mb, bool flash, bool reg, bool disk)
        : Napi::AsyncWorker(callback),
        m_motherboard(mb), m_biosFlash(flash), m_cleanReg(reg), m_cleanDisk(disk),
        uStatus(false), kStatus(false), dStatus(false) {
    }

    void Execute() override {
        uStatus = run_user_spoof(m_motherboard.c_str(), m_biosFlash, m_cleanReg);
        kStatus = run_kernel_spoof();

        if (m_cleanDisk) {
            dStatus = SpoofDisk();
        }
    }

    void OnOK() override {
        Napi::HandleScope scope(Env());
        Napi::Object res = Napi::Object::New(Env());
        res.Set("User", Napi::Boolean::New(Env(), uStatus));
        res.Set("Kernel", Napi::Boolean::New(Env(), kStatus));
        res.Set("disk", Napi::Boolean::New(Env(), dStatus));
        Callback().Call({ Env().Null(), res });
    }

private:
    std::string m_motherboard;
    bool m_biosFlash, m_cleanReg, m_cleanDisk;
    bool uStatus, kStatus, dStatus;
};

Napi::Value RunSpooferAsync(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsFunction()) {
        Napi::TypeError::New(env, "Expected options object and callback").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Object options = info[0].As<Napi::Object>();
    Napi::Function cb = info[1].As<Napi::Function>();

    std::string motherboard = options.Get("motherboard").As<Napi::String>();
    bool biosFlash = options.Get("biosFlash").As<Napi::Boolean>();
    bool cleanReg = options.Get("cleanReg").As<Napi::Boolean>();
    bool cleanDisk = options.Get("cleanDisk").As<Napi::Boolean>();

    // Create the worker with the UI data
    SpoofWorker* worker = new SpoofWorker(cb, motherboard, biosFlash, cleanReg, cleanDisk);
    worker->Queue();

    return env.Undefined();
}

// --- MODULE INIT ---

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("getMachineID", Napi::Function::New(env, [](const Napi::CallbackInfo& info) {
        return Napi::String::New(info.Env(), GetMachineID());
        }));
    exports.Set("getBaseboard", Napi::Function::New(env, GetBaseboardSerial));
    exports.Set("getGPUID", Napi::Function::New(env, GetGPUID));
    exports.Set("runSpoofer", Napi::Function::New(env, RunSpooferAsync));
    exports.Set("launchCheat", Napi::Function::New(env, LaunchCheat));
    return exports;
}

NODE_API_MODULE(spoofer, Init)

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
