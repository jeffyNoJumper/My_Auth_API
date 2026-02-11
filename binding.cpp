#include <napi.h>
#include "spoofer.cpp" // Ensure your spoofer logic is in this file

Napi::Value RunSpoofer(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    // Execute the functions from your spoofer.cpp
    bool disk = SpoofDisk();
    bool guid = SpoofGUID();
    bool mac = SpoofMAC();

    Napi::Object result = Napi::Object::New(env);
    result.Set("disk", Napi::Boolean::New(env, disk));
    result.Set("guid", Napi::Boolean::New(env, guid));
    result.Set("mac", Napi::Boolean::New(env, mac));

    return result;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "runSpoofer"), Napi::Function::New(env, RunSpoofer));
    return exports;
}

NODE_API_MODULE(spoofer, Init)
