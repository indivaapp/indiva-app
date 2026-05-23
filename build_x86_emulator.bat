@echo off
set GRADLE_USER_HOME=C:\gradle
echo [Emulator Build] x86_64 APK derleniyor...
cd /d D:\indivayeni\android
call gradlew.bat assembleDebug -PreactNativeArchitectures=x86_64
if %ERRORLEVEL% NEQ 0 (
    echo HATA: Build basarisiz!
    pause
    exit /b 1
)
echo [Emulator Build] APK emulatore yukleniyor...
D:\Android\Sdk\platform-tools\adb.exe -e uninstall com.indiva.app 2>nul
D:\Android\Sdk\platform-tools\adb.exe -e install app\build\outputs\apk\debug\app-debug.apk
D:\Android\Sdk\platform-tools\adb.exe -e shell am start -n com.indiva.app/.MainActivity
echo Tamam! Emulator'de uygulama acildi.
pause
