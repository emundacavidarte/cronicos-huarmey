# GUÍA DE DESPLIEGUE, VERSIONADO EN GITHUB Y ESCALAMIENTO A ANDROID
## Prototipo de Seguimiento de Pacientes Crónicos — Hospital de Apoyo Huarmey (II-1)

---

## 1. Modos de Ejecución Local

El prototipo está diseñado bajo una arquitectura desacoplada que permite dos modalidades de ejecución en el hospital:

### Modalidad A: Servidor API RESTful Concurrente (Node.js) — Recomendado
Permite que múltiples usuarios en la red local del hospital (Admisión, Consultorios, Estadística) se conecten simultáneamente a través de sus navegadores:
1. Abrir terminal en la carpeta `server/`:
   ```bash
   cd "C:\Users\PC-EDWARD\OneDrive\MAXIME\Cronicos_Huarmey\Prototipo_Aplicación\server"
   npm install
   node server.js
   ```
2. El servidor iniciará en el puerto `3000`:
   * Interfaz de usuario: `http://localhost:3000` (o la IP local del equipo: `http://192.168.1.X:3000`)
   * Endpoints FHIR: `http://localhost:3000/fhir/`
   * Endpoints de API: `http://localhost:3000/api/`

### Modalidad B: Ejecución Estática (Client-Side Standalone)
Si se requiere demostración inmediata sin instalar dependencias o sin conexión a red:
* Basta con abrir directamente el archivo `client/index.html` en cualquier navegador moderno (Chrome, Edge, Firefox, Safari) o levantarlo con una extensión como Live Server.

---

## 2. Preparación y Subida al Repositorio de GitHub

Para asegurar el versionado colaborativo y la continuidad del proyecto:

1. **Inicializar el repositorio Git en la carpeta del prototipo:**
   ```bash
   cd "C:\Users\PC-EDWARD\OneDrive\MAXIME\Cronicos_Huarmey\Prototipo_Aplicación"
   git init
   git add .
   git commit -m "feat: prototipo inicial cronicos huarmey con georis ancash y hl7 fhir"
   ```

2. **Vincular con GitHub y Publicar:**
   ```bash
   git remote add origin https://github.com/TU_USUARIO/cronicos-huarmey-georis.git
   git branch -M main
   git push -u origin main
   ```

3. **Publicación Automática en GitHub Pages (para visualización en nube inmediata):**
   * En la configuración del repositorio (`Settings > Pages`), seleccionar la carpeta `client` o la raíz como rama de publicación. El prototipo estará accesible públicamente vía web en segundos.

---

## 3. Escalamiento hacia Aplicación Móvil Android

El prototipo fue concebido desde el primer día con diseño táctil y responsive para convertirse en una aplicación para smartphones Android utilizada por el personal médico, enfermeras y agentes comunitarios en campo.

### Método 1: Progressive Web App (PWA) Nativa — Listo para Usar
El cliente incluye un archivo `manifest.json` y un `sw.js` (Service Worker):
1. Abrir la URL del aplicativo desde Google Chrome en un celular o tablet Android.
2. Tocar el menú de opciones (tres puntos verticales) y presionar **"Instalar aplicación"** o **"Agregar a la pantalla principal"**.
3. El aplicativo se instalará con su propio icono, pantalla de inicio (splash screen) y funcionará en pantalla completa sin barra de navegación del navegador, con soporte para almacenamiento local offline.

### Método 2: Empaquetado APK Nativo con Capacitor (Paso a Paso)
Si se desea generar un archivo ejecutable `.apk` para instalarlo por sideloading o subirlo a Google Play Store:
1. Instalar Capacitor en la carpeta del cliente:
   ```bash
   npm install -g @capacitor/cli @capacitor/core
   npm install @capacitor/android
   npx cap init "Cronicos Huarmey" "pe.gob.minsa.cronicoshuarmey" --web-dir client
   npx cap add android
   ```
2. Abrir el proyecto en Android Studio:
   ```bash
   npx cap open android
   ```
3. Generar el APK firmado en Android Studio (`Build > Build Bundle(s) / APK(s) > Build APK`).
