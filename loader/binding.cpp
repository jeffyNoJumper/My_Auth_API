#include <napi.h>
#include <windows.h>
#include <map>
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

bool SetMachineID(const std::string& newGuid) {
    HKEY hKey;
    // CRITICAL: KEY_WOW64_64KEY is required to hit the REAL registry on 64-bit Windows
    if (RegOpenKeyExA(HKEY_LOCAL_MACHINE, "SOFTWARE\\Microsoft\\Cryptography", 0, KEY_ALL_ACCESS | KEY_WOW64_64KEY, &hKey) == ERROR_SUCCESS) {

        // Ensure the string is null-terminated (+1)
        LSTATUS status = RegSetValueExA(hKey, "MachineGuid", 0, REG_SZ, (const BYTE*)newGuid.c_str(), (DWORD)(newGuid.size() + 1));

        RegFlushKey(hKey); // FORCE Windows to commit the change to disk
        RegCloseKey(hKey);

        return (status == ERROR_SUCCESS);
    }
    return false;
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
    // Cast to INT_PTR to avoid 64-bit truncation warnings
    INT_PTR result = reinterpret_cast<INT_PTR>(ShellExecuteA(NULL, "open", path.c_str(), NULL, NULL, SW_SHOWNORMAL));
    return result > 32;
}

bool LaunchInjector(const std::string& gameName, const std::string& dllPath) {
    std::string injectorPath = "C:\\Users\\mac98\\Desktop\\Devs Projects\\Simple Dll Injector\\Extreme Injector v3.exe";
    std::string injectorDir = "C:\\Users\\mac98\\Desktop\\Devs Projects\\Simple Dll Injector\\";
    std::string parameters = "-p cs2.exe -l \"" + dllPath + "\"";

    // Use INT_PTR to handle the HINSTANCE return value safely on x64
    HINSTANCE res = ShellExecuteA(
        NULL,
        "open",
        injectorPath.c_str(),
        parameters.c_str(),
        injectorDir.c_str(),
        SW_HIDE
    );

    return (reinterpret_cast<INT_PTR>(res) > 32);
}

Napi::Value LaunchCheat(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 4) {
        Napi::TypeError::New(env, "Arguments: Game, Type, Path, Key").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string game = info[0].As<Napi::String>();
    std::string type = info[1].As<Napi::String>();
    std::string path = info[2].As<Napi::String>();
    std::string fullKey = info[3].As<Napi::String>();

    // 1. Standardize Game String (Fixed transform logic)
    std::string gameUpper = game;
    for (auto& c : gameUpper) c = toupper(c);

    // 2. Extract Prefix
    size_t dashPos = fullKey.find('-');
    std::string prefix = (dashPos != std::string::npos) ? fullKey.substr(0, dashPos) : fullKey;
    for (auto& c : prefix) c = toupper(c);

    // 3. Define Backend Access Map (Requires #include <map>)
    std::map<std::string, std::string> accessMap = {
        {"CS2", "CS2X"},
        {"VALORANT", "VALX"},
        {"WARZONE", "WZX"},
        {"GTAV", "GTAX"},
        {"FORTNITE", "FRTX"}
    };

    // 4. Validation Logic
    bool authorized = (prefix == "ALLX");
    if (!authorized && accessMap.count(gameUpper)) {
        if (accessMap[gameUpper] == prefix) {
            authorized = true;
        }
    }

    // 5. Execution
    bool result = false;
    if (authorized) {
        if (type == "external") {
            result = LaunchExternal(path);
        }
        else if (type == "dll") {
            result = LaunchInjector(game, path);
        }
    }
    else {
        printf("[Security] Blocked %s launch for prefix %s\n", gameUpper.c_str(), prefix.c_str());
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

    // 1. Validate inputs (Ensure we have options and a callback)
    if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsFunction()) {
        Napi::TypeError::New(env, "Expected options object and callback").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Object options = info[0].As<Napi::Object>();
    Napi::Function cb = info[1].As<Napi::Function>();

    // 2. SAFE EXTRACTION (Prevents Fatal Error if property is missing)
    // We check .Has() or use .ToString() fallback to ensure stability
    std::string motherboard = options.Has("motherboard") ? options.Get("motherboard").ToString().Utf8Value() : "Auto";
    bool biosFlash = options.Has("biosFlash") ? options.Get("biosFlash").ToBoolean().Value() : false;
    bool cleanReg = options.Has("cleanReg") ? options.Get("cleanReg").ToBoolean().Value() : true;
    bool cleanDisk = options.Has("cleanDisk") ? options.Get("cleanDisk").ToBoolean().Value() : true;

    // 3. CAPTURE THE NEW GUID (For the Registry Reset)
    if (options.Has("newMachineGuid")) {
        std::string newGuid = options.Get("newMachineGuid").ToString().Utf8Value();
        // Trigger the Registry Write immediately before the worker starts
        SetMachineID(newGuid);
    }

    // 4. Create the worker with the UI data
    SpoofWorker* worker = new SpoofWorker(cb, motherboard, biosFlash, cleanReg, cleanDisk);
    worker->Queue();

    return env.Undefined();
}

// --- MODULE INIT ---

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("getMachineID", Napi::Function::New(env, [](const Napi::CallbackInfo& info) {
        return Napi::String::New(info.Env(), GetMachineID());
        }));

    // --- ADD THIS LINE TO FIX THE STUCK ID ---
    exports.Set("setMachineID", Napi::Function::New(env, [](const Napi::CallbackInfo& info) {
        std::string newID = info[0].As<Napi::String>().Utf8Value();
        return Napi::Boolean::New(info.Env(), SetMachineID(newID));
        }));

    exports.Set("getBaseboard", Napi::Function::New(env, GetBaseboardSerial));
    exports.Set("getGPUID", Napi::Function::New(env, GetGPUID));
    exports.Set("runSpoofer", Napi::Function::New(env, RunSpooferAsync));
    exports.Set("launchCheat", Napi::Function::New(env, LaunchCheat));
    return exports;
}


NODE_API_MODULE(spoofer, Init)
