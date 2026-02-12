@echo off
echo =====================================
echo Building SK Admin Panel (dev build)...
echo =====================================

REM Go to the loader folder
cd /d "C:\Users\mac98\Desktop\Devs Projects\My_Auth_API-main\My_Auth_API-main\loader"

REM Build the panel (webpack / npm)
echo Running npm build...
npm run build-panel

IF ERRORLEVEL 1 (
    echo Build failed!
    pause
    exit /b 1
)

echo =====================================
echo Packaging panel with electron-builder...
echo =====================================

REM Build portable version with electron-builder
npx electron-builder --config electron-builder-panel.json

IF ERRORLEVEL 1 (
    echo Packaging failed!
    pause
    exit /b 1
)

echo =====================================
echo Build & packaging complete!
echo Output folder: SK ADMIN PANEL
pause
