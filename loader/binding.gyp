{
  "targets": [
    {
      "target_name": "spoofer",
      "sources": [ 
        "binding.cpp",
        "Backend/User/main.c", 
        "Backend/User/util.c",
        "Backend/Kernel/main.c"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "Backend/User",
        "Backend/Kernel"
      ],
      "libraries": [ "-ladvapi32.lib", "-luser32.lib", "-lshell32.lib" ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [
          "NAPI_DISABLE_CPP_EXCEPTIONS", "UNICODE", "_UNICODE"]
    }
  ]
}
