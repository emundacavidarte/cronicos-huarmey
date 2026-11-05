# Programas del recorrido en navegador (05/11/2026)

Estos programas controlan el navegador de forma automática con la herramienta Playwright y produjeron el reporte `docs/REPORTE_PRUEBA_NAVEGADOR_2026-11-05.md`. No forman parte de `npm test` ni agregan dependencias al proyecto: Playwright se instala aparte (por ejemplo, de forma global).

1. Levante el servidor sobre una carpeta de datos **temporal y vacía** (nunca sobre el `store.json` real):
   ```bash
   DATA_DIR=/ruta/temporal ADMIN_USER=admin ADMIN_PASSWORD='Prueba2026*Huarmey' AUTH_SECRET='clave-de-prueba-local-32-caracteres-min-xx' node server/server.js
   ```
2. Copie estos programas a una carpeta de trabajo, cree en ella la subcarpeta `shots/` (para las capturas) y ejecútelos en este orden:
   - `recorrido1.js`: acceso, mapa, indicadores, filtros, búsqueda, ficha, capas y tablero. Exporta el Excel que usan los siguientes.
   - `recorrido2.js`: registro clínico, cuadrícula de Excel, carga de CSV, pre-cita, WhatsApp, usuarios y roles. Crea pacientes y usuarios inventados.
   - `recorrido3.js`: adaptación a 9 tamaños de pantalla. Guarda las capturas en `shots/responsive/`.
   - `sin_conexion.js`: abre la aplicación con el servidor apagado. Necesita la variable `SPID` con el número de proceso del servidor, porque lo detiene.
