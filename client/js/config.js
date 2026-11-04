/**
 * config.js
 * Configuración centralizada de endpoints y parámetros del cliente
 * Diseñado para escalabilidad cloud, alta concurrencia (1,000+ usuarios) y desacoplamiento de entornos
 */

const APP_CONFIG = {
  // Versión del Sistema y Branding
  VERSION: "3.0.0-ENTERPRISE-AUDIT",
  SYSTEM_NAME: "MÁXIME Salud Digital",
  PRODUCT_NAME: "Sistema de Manejo Territorial de Pacientes Crónicos (HL7 FHIR R4 & GeoRIS)",
  HOSPITAL_NAME: "Nuevo Hospital de Apoyo Huarmey (II-1)",
  HOSPITAL_COD_RENIPRESS: "00001741",
  RIS_ID_DEFAULT: 156, // RIS Pacífico Sur
  
  // Modos de Conexión: 'LOCAL_MOCK', 'LOCAL_SERVER', 'CLOUD_PRODUCTION'
  ENV_MODE: 'LOCAL_SERVER',

  // Endpoints de API REST y Estándar HL7 FHIR R4
  ENDPOINTS: {
    LOCAL_SERVER: {
      BASE_URL: "",
      FHIR_METADATA: "/fhir/metadata",
      FHIR_BUNDLE: "/fhir/Bundle",
      FHIR_PATIENTS: "/fhir/Patient",
      FHIR_LOINC_CATALOG: "/fhir/loinc-catalog",
      API_CRONICOS: "/api/cronicos",
      API_PATIENTS: "/api/patients",
      API_INDICADORES: "/api/indicadores",
      API_PATIENTS_GEO: "/api/patients/geo",
      API_ALERTS_SUMMARY: "/api/alerts/summary",
      API_PRECITAS: "/api/appointments/pre-cita",
      AUTH_LOGIN: "/api/auth/login",
      AUTH_LOGOUT: "/api/auth/logout",
      AUTH_ME: "/api/auth/me",
      AUTH_REDES: "/api/auth/redes",
      API_USERS: "/api/users",
      WEBHOOK_HOSIX: "/api/webhooks/hosix",
      WEBHOOK_GALENOS: "/api/webhooks/galenos",
      WEBHOOK_PAKAMUROS: "/api/webhooks/pakamuros"
    },
    CLOUD_PRODUCTION: {
      BASE_URL: "https://api.salud.maxime.pe/v1",
      FHIR_METADATA: "https://api.salud.maxime.pe/v1/fhir/metadata",
      FHIR_BUNDLE: "https://api.salud.maxime.pe/v1/fhir/Bundle",
      FHIR_PATIENTS: "https://api.salud.maxime.pe/v1/fhir/Patient",
      FHIR_LOINC_CATALOG: "https://api.salud.maxime.pe/v1/fhir/loinc-catalog",
      API_CRONICOS: "https://api.salud.maxime.pe/v1/cronicos",
      API_PATIENTS: "https://api.salud.maxime.pe/v1/patients",
      API_INDICADORES: "https://api.salud.maxime.pe/v1/indicadores",
      API_PATIENTS_GEO: "https://api.salud.maxime.pe/v1/patients/geo",
      API_ALERTS_SUMMARY: "https://api.salud.maxime.pe/v1/alerts/summary",
      API_PRECITAS: "https://api.salud.maxime.pe/v1/appointments/pre-cita",
      AUTH_LOGIN: "https://api.salud.maxime.pe/v1/auth/login",
      AUTH_LOGOUT: "https://api.salud.maxime.pe/v1/auth/logout",
      AUTH_ME: "https://api.salud.maxime.pe/v1/auth/me",
      AUTH_REDES: "https://api.salud.maxime.pe/v1/auth/redes",
      API_USERS: "https://api.salud.maxime.pe/v1/users",
      WEBHOOK_HOSIX: "https://api.salud.maxime.pe/v1/webhooks/hosix",
      WEBHOOK_GALENOS: "https://api.salud.maxime.pe/v1/webhooks/galenos",
      WEBHOOK_PAKAMUROS: "https://api.salud.maxime.pe/v1/webhooks/pakamuros"
    }
  },

  // Umbrales de Nivel de Detalle Cartográfico (LOD / Performance)
  MAP_PERFORMANCE: {
    PREFER_CANVAS: true,
    MIN_ZOOM_STREETS: 13,     // Calles y ejes viales visibles a partir de zoom 13
    MIN_ZOOM_BUILDINGS: 14,   // Manzanas y lotes catastrales visibles a partir de zoom 14
    MAX_ZOOM_MACRO_FILL: 15,  // Polígonos de RIS transparentes a partir de zoom 15 para no tapar lotes
    CANVAS_THRESHOLD: 1500,   // Si hay > 1,500 pacientes filtrados, activar pines Canvas de alta densidad
    TILE_BUFFER: 4,           // Carga anticipada de tiles en memoria
    DEBOUNCE_COORDS_MS: 50    // Throttling de lectura de coordenadas
  },

  // Retorna las URLs activas según el entorno
  getApi() {
    return this.ENDPOINTS[this.ENV_MODE] || this.ENDPOINTS.LOCAL_SERVER;
  }
};

// Exportar globalmente
if (typeof module !== 'undefined' && module.exports) {
  module.exports = APP_CONFIG;
} else {
  window.APP_CONFIG = APP_CONFIG;
}
