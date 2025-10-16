@echo off
echo 🤖 INSTALANDO DEF BINANCE PROFESSIONAL BOT
echo.

echo 📦 Instalando dependencias de Node.js...
npm install

echo.
echo 📁 Creando directorios necesarios...
if not exist "data" mkdir data
if not exist "data\images" mkdir data\images
if not exist "data\analysis" mkdir data\analysis
if not exist "data\signals" mkdir data\signals
if not exist "logs" mkdir logs

echo.
echo ✅ Instalación completada!
echo.
echo 🔧 PRÓXIMOS PASOS:
echo 1. Editar config.env con tus tokens
echo 2. Ejecutar: npm start
echo 3. Probar con: /start en Telegram
echo.
pause
