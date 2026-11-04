@echo off
chcp 65001 >nul
title Motor de Inteligencia Territorial de Cronicos - Hospital II-1 Huarmey
echo =======================================================================
echo  HOSPITAL DE APOYO HUARMEY (II-1) - RIS PACIFICO SUR (N 156)
echo  Prototipo de Seguimiento de Cronicos (HTA y DM2)
echo  Interoperabilidad Nativa HL7 FHIR (R4) ^& GeoRIS MINSA
echo =======================================================================
echo.
cd /d "%~dp0server"
echo [1/2] Abriendo navegador en http://localhost:3000 ...
start "" http://localhost:3000
echo [2/2] Servidor activo. Presione Ctrl+C para detener de forma segura.
node server.js
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] El servidor se detuvo o encontro un problema al iniciar.
    echo Asegurese de contar con Node.js instalado y que el puerto 3000 no este ocupado.
)
pause
