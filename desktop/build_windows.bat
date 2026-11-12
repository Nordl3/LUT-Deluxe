@echo off
setlocal
cd /d "%~dp0\.."
echo =====================================
echo   LUT Deluxe - Portable Windows EXE Build
echo =====================================
echo Installing desktop dependencies...
py -3 -m pip install -r desktop\requirements.txt
if errorlevel 1 goto :error

echo Compiling...
py -3 -m PyInstaller --noconfirm --clean --onefile --windowed --name LUTDeluxe ^
  --add-data "index.html;." ^
  --add-data "styles.css;." ^
  --add-data "app.js;." ^
  --add-data "engine.js;." ^
  --add-data "manifest.webmanifest;." ^
  --add-data "icon.svg;." ^
  --add-data "sw.js;." ^
  desktop\desktop.py
if errorlevel 1 goto :error

echo.
echo SUCCESS: dist\LUTDeluxe.exe
echo Test saving LUT files and audio on a Windows machine before sharing!
pause
exit /b 0
:error
echo.
echo Build failed. Check the messages above.
pause
exit /b 1
