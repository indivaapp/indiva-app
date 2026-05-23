@echo off
set GRADLE_USER_HOME=C:\gradle
cd /d D:\indivayeni\android
call gradlew.bat clean
call gradlew.bat assembleDebug -PreactNativeArchitectures=x86_64
echo BUILD_EXIT=%ERRORLEVEL%
