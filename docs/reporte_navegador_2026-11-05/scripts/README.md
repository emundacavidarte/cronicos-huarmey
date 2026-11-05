# Scripts del recorrido en navegador (05/11/2026)

Scripts de Playwright que se usaron para el reporte `docs/REPORTE_PRUEBA_NAVEGADOR_2026-11-05.md`. No forman parte de `npm test` y no agregan dependencias al proyecto: necesitan Playwright instalado aparte (por ejemplo, de forma global).

1. Levante el servidor sobre una carpeta de datos **temporal y vacía** (nunca sobre `store.json` real):
   ```bash
   DATA_DIR=/ruta/temporal ADMIN_USER=admin ADMIN_PASSWORD='Prueba2026*Huarmey' AUTH_SECRET='clave-de-prueba-local-32-caracteres-min-xx' node server/server.js
   ```
2. Copie estos scripts a una carpeta de trabajo, cree en ella la subcarpeta `shots/` y ejecútelos en orden:
   - `recorrido1.js`: acceso, mapa, KPI, filtros, búsqueda, ficha, capas y tablero. Exporta el Excel que usan los siguientes.
   - `recorrido2.js`: registro clínico, cuadrícula Excel, ingesta CSV, pre-cita, WhatsApp, usuarios y roles (crea pacientes y usuarios inventados).
   - `recorrido3.js`: responsive en 9 tamaños de pantalla (capturas en `shots/responsive/`).
   - `sin_conexion.js`: abre la aplicación con el servidor apagado. Requiere `SPID=<pid del servidor>`, porque lo detiene.
