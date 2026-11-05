# Capas GeoRIS oficiales del MINSA (Áncash)

Esta carpeta recibe las capas **públicas** de GeoRIS descargadas desde la PC de la oficina. Se suben al repositorio
para compararlas con las del prototipo y actualizar el mapa. No contienen datos de pacientes.

## 1. Descargar desde su navegador (Chrome o Edge)

1. Abra **https://geominsa.minsa.gob.pe/geominsaserver/rest/services** y compruebe que se ve la lista de servicios.
2. Pulse **F12** y vaya a la pestaña **Consola**. Si Chrome muestra una advertencia sobre pegar código, escriba
   `permitir pegar` (o `allow pasting`) y pulse Enter.
3. Abra el archivo `tools/descargar_georis_en_navegador.js` de este proyecto, copie **todo** su contenido, péguelo en la
   consola y pulse **Enter**.
4. Espere los mensajes `[GeoRIS] … Listo`. Si el navegador pregunta si permite descargar varios archivos, elija **Permitir**.
5. En su carpeta **Descargas** quedarán: `ris.geojson`, `zonas.geojson`, `sectores.geojson`, `eessArea.geojson`,
   `eessZona.geojson`, `eessPuertas.geojson`, `eessVinculados.geojson` y `manifiesto.json`.

## 2. Copiarlos a esta carpeta

Mueva esos 8 archivos a `georis_oficial/` (esta carpeta, junto a este LEEME).

## 3. Subir la carpeta a la nube (GitHub)

**Opción A — sin programas (navegador):**
1. Abra el repositorio en GitHub, cambie a la rama **`claude/epic-hamilton-exotru`** y entre a la carpeta `georis_oficial`.
2. Pulse **Add file → Upload files**, arrastre los 8 archivos y pulse **Commit changes**.

**Opción B — con git en la PC:** desde la carpeta del proyecto:

```bash
git add georis_oficial
git commit -m "Capas GeoRIS oficiales descargadas desde el navegador"
git push origin claude/epic-hamilton-exotru
```

## 4. Comparar y actualizar

Avise a Claude que ya están subidas: compara las capas (`tools/comparar_georis_oficial.js --desde=georis_oficial`),
actualiza el mapa con las oficiales si difieren y corre las pruebas. También puede hacerlo usted en la PC:

```bash
node tools/comparar_georis_oficial.js --desde=georis_oficial --actualizar
```
