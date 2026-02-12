@echo off
echo =====================================
echo Building SK USER LOADER (User build)...
echo =====================================

REM Go to the loader folder
cd /d "C:\Users\mac98\Desktop\Devs Projects\My_Auth_API-main\My_Auth_API-main\loader"

REM Build the loader (production build)
echo Running npm build...
npm run build

IF ERRORLEVEL 1 (
    echo Build failed! 
    echo Check if 'npm run build' is defined in your package.json
    pause
    exit /b 1
)

echo =====================================
echo Packaging loader with electron-builder...
echo =====================================

REM Build the NSIS installer/portable version using the main package.json config
npx electron-builder --publish never

IF ERRORLEVEL 1 (
    echo Packaging failed!
    pause
    exit /b 1
)

echo =====================================
echo Build & packaging complete!
echo Output folder: SK ALL IN-ONE LOADER
echo =====================================
pause
