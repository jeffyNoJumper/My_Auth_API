#include <napi.h>
#include "spoofer.cpp" // Contains your HWID and Spoofer logic

// 1. Fetch HWID from C++ to JS
Napi::String GetHWID(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    std::string hwid = GetMachineID(); // Function from spoofer.cpp
    return Napi::String::New(env, hwid);
}

// 2. Trigger Spoofer
Napi::Value RunSpoofer(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    bool disk = SpoofDisk();
    bool guid = SpoofGUID();
    bool mac = SpoofMAC();

    Napi::Object result = Napi::Object::New(env);
    result.Set("disk", Napi::Boolean::New(env, disk));
    result.Set("guid", Napi::Boolean::New(env, guid));
    result.Set("mac", Napi::Boolean::New(env, mac));
    return result;
}

// 3. Trigger Injection/Launch
Napi::Boolean LaunchCheat(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    std::string gameName = info[0].As<Napi::String>().Utf8Value();
    
    // Logic: If FiveM, call specific function, etc.
    // Example: bool success = Injector::Load(gameName);
    bool success = true; // Placeholder for your .dll injection logic
    return Napi::Boolean::New(env, success);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("getMachineID", Napi::Function::New(env, GetHWID));
    exports.Set("runSpoofer", Napi::Function::New(env, RunSpoofer));
    exports.Set("launchCheat", Napi::Function::New(env, LaunchCheat));
    return exports;
}

NODE_API_MODULE(spoofer, Init)
