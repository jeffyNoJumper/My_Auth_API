{
  "targets": [
    {
      "target_name": "spoofer",
      "sources": [ 
        "binding.cpp",
        "user/main.c", 
        "kernel/main.c"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "user",
        "kernel"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ]
    }
  ]
}
