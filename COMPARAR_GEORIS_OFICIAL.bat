@echo off
REM Compara las capas GeoRIS del prototipo con la fuente oficial del MINSA (Areas, Zonas, Sectores y establecimientos de Ancash).
REM Uso: doble clic (solo compara)  o  COMPARAR_GEORIS_OFICIAL.bat --actualizar  (ademas actualiza el bundle con copia de respaldo)
cd /d "%~dp0"
node tools\comparar_georis_oficial.js %*
echo.
echo Informe: docs\COMPARACION_GEORIS_OFICIAL.md
pause
