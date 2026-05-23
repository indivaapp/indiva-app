@echo off
set GRADLE_USER_HOME=C:\gradle
echo [1/2] Temizleniyor...
"D:\indivayeni\android\gradlew.bat" -p "D:\indivayeni\android" clean
if %errorlevel% neq 0 (
  echo HATA: clean basarisiz!
  pause
  exit /b 1
)
echo [2/2] Derleniyor ve yukleniyor...
"D:\indivayeni\android\gradlew.bat" -p "D:\indivayeni\android" installDebug
if %errorlevel% neq 0 (
  echo HATA: installDebug basarisiz!
  pause
  exit /b 1
)
echo Bitti!
pause
