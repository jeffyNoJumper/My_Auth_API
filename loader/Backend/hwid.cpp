#include <windows.h>
#include <string>
#include <iostream>

// Simple HWID generator using the Volume Serial Number
std::string GetMachineID() {
    DWORD serialNum = 0;
    GetVolumeInformationA("C:\\", NULL, 0, &serialNum, NULL, NULL, NULL, 0);
    
    // Convert the number to a string/hex
    return std::to_string(serialNum);
}
