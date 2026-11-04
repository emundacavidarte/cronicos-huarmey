-- Esquema de Base de Datos para el Motor Territorial de Crónicos (HL7 FHIR R4 compliant)
-- Ámbito: Nuevo Hospital de Apoyo Huarmey II-1 / Red Pacífico Sur N° 156
-- Alineado a las 56 variables del Padrón Nominal DNT MINSA, Iniciativa HEARTS (OPS/OMS) y RENHICE (Ley N° 30024)

CREATE TABLE IF NOT EXISTS health_establishments (
    cod_renipress TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    categoria TEXT NOT NULL,
    rol_georis TEXT NOT NULL, -- 'Puerta de Entrada', 'Zona Sanitaria', 'Area Sanitaria / Hospital'
    red_salud TEXT NOT NULL,
    microrred TEXT NOT NULL,
    provincia TEXT NOT NULL,
    distrito TEXT NOT NULL,
    direccion TEXT,
    latitud REAL NOT NULL,
    longitud REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS patients (
    id TEXT PRIMARY KEY, -- Formato FHIR: pac-00001741-DNI
    dni TEXT UNIQUE NOT NULL,
    historia_clinica TEXT NOT NULL,
    apellidos_nombres TEXT NOT NULL,
    sexo TEXT, -- 'M', 'F'
    edad INTEGER,
    fecha_nacimiento DATE,
    fallecido INTEGER DEFAULT 0,
    financiador TEXT DEFAULT 'SIS',
    telefono TEXT,
    direccion TEXT NOT NULL,
    distrito TEXT DEFAULT 'Huarmey',
    latitud REAL,
    longitud REAL,
    precision_geo TEXT DEFAULT 'exacta',
    sector_sanitario TEXT,
    puerta_entrada_id TEXT DEFAULT '00001741',
    tipo_condicion TEXT, -- 'HTA', 'DM', 'HTA + DM', 'ERC'
    cie10_principal TEXT,
    dano_organo_blanco TEXT,
    otras_patologias TEXT,
    tratamiento_hta TEXT,
    tratamiento_dm TEXT,
    pa_sistolica INTEGER,
    pa_diastolica INTEGER,
    glucosa REAL,
    hba1c REAL,
    peso REAL,
    talla REAL,
    imc REAL,
    pab REAL,
    diagnostico_nutricional TEXT,
    riesgo_cv TEXT,
    microalbumina REAL,
    creatinina REAL,
    depuracion_creatinina REAL,
    colesterol_total REAL,
    trigliceridos REAL,
    colesterol_hdl REAL,
    colesterol_ldl REAL,
    estado_control TEXT,
    semaforo TEXT, -- 'green', 'yellow', 'red', 'purple', 'gray'
    frecuencia_hearts INTEGER DEFAULT 30,
    ultima_atencion DATE,
    proxima_cita DATE,
    fecha_examenes DATE,
    observacion TEXT,
    recomendacion TEXT,
    fuente TEXT DEFAULT 'PADRON_DNT',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (puerta_entrada_id) REFERENCES health_establishments(cod_renipress)
);

CREATE TABLE IF NOT EXISTS conditions (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    cie10_cod TEXT NOT NULL, -- I10 (HTA), E11 (DM2), N18 (ERC)
    diagnostico TEXT NOT NULL,
    estado_clinico TEXT DEFAULT 'active',
    fecha_diagnostico DATE,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    fecha_cita DATE NOT NULL,
    estado TEXT DEFAULT 'booked', -- 'booked', 'fulfilled', 'noshow', 'proposed'
    frecuencia_dias INTEGER DEFAULT 30, -- 30 para No Controlado, 90 para Controlado
    es_precita INTEGER DEFAULT 0,
    comentarios TEXT,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS observations (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    fecha_registro DATE NOT NULL,
    pa_sistolica INTEGER,
    pa_diastolica INTEGER,
    glucosa REAL,
    hba1c REAL,
    peso REAL,
    talla REAL,
    imc REAL,
    pab REAL,
    creatinina REAL,
    microalbumina REAL,
    depuracion_creatinina REAL,
    colesterol_total REAL,
    trigliceridos REAL,
    colesterol_hdl REAL,
    colesterol_ldl REAL,
    riesgo_cv TEXT,
    diagnostico_nutricional TEXT,
    estado_control TEXT, -- 'Controlado', 'No Controlado', 'Sin Datos de Control en Padrón'
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS medications (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    categoria TEXT NOT NULL, -- 'HTA', 'DM'
    esquema TEXT NOT NULL,
    estado TEXT DEFAULT 'active',
    fecha_prescripcion DATE DEFAULT CURRENT_DATE,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    sistema_origen TEXT NOT NULL, -- 'HOSIX_WEBHOOK', 'GALENOS_WEBHOOK', 'PAKAMUROS_WEBHOOK', 'FHIR_API', 'SISTEMA_LOCAL'
    evento TEXT NOT NULL,
    actor TEXT DEFAULT 'OPERADOR_AUTORIZADO',
    ip TEXT DEFAULT '127.0.0.1',
    payload_json TEXT,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Índices compuestos de alto rendimiento para 1,000+ usuarios concurrentes
CREATE INDEX IF NOT EXISTS idx_patients_dni ON patients(dni);
CREATE INDEX IF NOT EXISTS idx_patients_puerta ON patients(puerta_entrada_id);
CREATE INDEX IF NOT EXISTS idx_patients_sector ON patients(sector_sanitario);
CREATE INDEX IF NOT EXISTS idx_patients_semaforo ON patients(semaforo);
CREATE INDEX IF NOT EXISTS idx_conditions_patient ON conditions(patient_id, cie10_cod);
CREATE INDEX IF NOT EXISTS idx_appointments_patient_fecha ON appointments(patient_id, fecha_cita DESC);
CREATE INDEX IF NOT EXISTS idx_observations_patient_fecha ON observations(patient_id, fecha_registro DESC);
CREATE INDEX IF NOT EXISTS idx_medications_patient ON medications(patient_id);
