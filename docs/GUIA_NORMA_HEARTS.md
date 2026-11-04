# GUÍA TÉCNICA CLÍNICA: INICIATIVA HEARTS EN EL PERÚ
## Algoritmos de Seguimiento, Periodicidad de Citas (30 vs. 90 Días) y Semáforo de Alertas
### Estrategia para Hipertensión Arterial (CIE-10: I10) y Diabetes Mellitus Tipo 2 (CIE-10: E11)

---

## 1. Fundamento de la Iniciativa HEARTS (MINSA / OPS)

La **Iniciativa HEARTS en las Américas**, implementada en el Perú por el Ministerio de Salud (MINSA) a través de la Dirección de Prevención y Control de Enfermedades No Transmisibles, Raras y Huérfanas (DENOT), busca estandarizar y simplificar el tratamiento de las enfermedades cardiovasculares y metabólicas en el primer y segundo nivel de atención.

El pilar fundamental es la **Vía Clínica Estandarizada**, la cual reemplaza esquemas terapéuticos heterogéneos por combinaciones farmacológicas a dosis fijas y un protocolo predecible de citas médicas y entrega de medicamentos.

---

## 2. Definición Clínica de la Periodicidad: ¿Por qué 30 Días vs. 90 Días?

La periodicidad de las citas no es una elección administrativa arbitraria, sino un imperativo de seguridad farmacológica y control hemodinámico:

```
                            ÁRBOL DE DECISIÓN CLÍNICA HEARTS
                            
                              Paciente con HTA (I10) / DM2 (E11)
                                              │
                                              ▼
                             ¿Cumple metas terapéuticas estables?
                             • PA < 140/90 mmHg (o < 130/80 en alto RCV)
                             • HbA1c ≤ 7.0% (o glucosa ayunas < 130 mg/dL)
                             • Sin síntomas de alarma ni descompensación
                                              │
                       ┌──────────────────────┴──────────────────────┐
                       ▼ NO                                          ▼ SÍ
            [ESTADO: NO CONTROLADO]                       [ESTADO: CONTROLADO]
         • Recién diagnosticado, o                     • 3 o más controles estables
         • En ajuste/titulación de fármacos            • Adherente al tratamiento
                       │                                             │
                       ▼                                             ▼
           ┌───────────────────────┐                     ┌───────────────────────┐
           │   CITA A LOS 30 DÍAS  │                     │   CITA A LOS 90 DÍAS  │
           │       (1 MES)         │                     │       (3 MESES)       │
           │ • Receta para 30 días │                     │ • Receta trimestral   │
           │ • Titulación rápida   │                     │ • Descongestiona el   │
           │ • Control mensual de  │                     │   hospital; recojo de │
           │   presión / glucemia  │                     │   medicación en posta │
           └───────────────────────┘                     └───────────────────────┘
```

### Justificación Clínica del Esquema:
1. **Pacientes No Controlados (30 días):** Un paciente hipertenso con cifras iguales o superiores a 140/90 mmHg o un paciente diabético descompensado requiere escalamiento farmacológico (pasar de monoterapia a terapia dual, o añadir un tercer fármaco). Evaluar el efecto y la seguridad del ajuste farmacológico antes de los 30 días permite evitar que el paciente permanezca meses expuesto al daño endotelial.
2. **Pacientes Controlados (90 días):** Cuando el paciente alcanza la meta y se mantiene estable por tres controles consecutivos, la norma HEARTS indica que hacer acudir al paciente mensualmente al hospital es una barrera para la adherencia y satura la consulta externa. Se le prescribe medicación para 90 días (3 meses), con control médico integral trimestral.

---

## 3. Matriz del Semáforo de Alertas y Acciones Sanitarias

El aplicativo calcula diariamente para cada paciente los **días transcurridos desde su última cita** y los **días restantes hasta su próxima fecha límite**:

| Color del Semáforo | Condición Temporal | Estado Clínico | Acción Sanitaria Inmediata |
| :---: | :--- | :--- | :--- |
| 🟢 **VERDE (Vigente)** | Faltan > 7 días para la fecha límite de control | Paciente con cita y medicación al día según su pauta (30 o 90 d) | Monitoreo pasivo en el sistema. |
| 🟡 **AMARILLO (Próximo)** | Faltan entre 1 y 7 días para el vencimiento | Riesgo de interrupción del tratamiento | **Disparador de Pre-cita en HOSIX/Galenhos.** Envío de recordatorio por WhatsApp / llamada de telemonitoreo para asegurar asistencia. |
| 🔴 **ROJO (Vencido / Inasistente)** | Superó la fecha límite (≥ 1 día de vencimiento) | **DESERCIÓN DEL PROGRAMA.** Alto riesgo de eventos adversos (crisis hipertensiva, cetoacidosis, ACV, IAM) | **Alerta Crítica.** Generación de orden de visita domiciliaria para agentes comunitarios / promotores de salud y contacto telefónico prioritario. |
| ⚪ **GRIS (Nuevo / Sin Cita)** | Paciente registrado en HOSIX sin cita programada | Pendiente de enrolamiento en el protocolo HEARTS | Convocatoria para triaje y consulta de primera vez. |

---

## 4. Flujo de Pre-citas para Admisión Hospitalaria

Para cerrar la brecha entre la detección del paciente y la agenda médica formal de **HOSIX** o **Galenhos**:

```
[Algoritmo HEARTS detecta paciente en Semáforo Amarillo]
                          │
                          ▼
[Genera solicitud de Pre-cita en lista de trabajo]
                          │
                          ▼
[Admisión HOSIX confirma cupo en Consultorio de Crónicos]
                          │
                          ▼
[Disparador automático: Envío de WhatsApp de Confirmación al Paciente]
```

### Plantilla de Notificación por WhatsApp:
> *«Hospital de Apoyo Huarmey — Programa de Crónicos HEARTS*  
> *Estimado(a) [Nombre del Paciente]: Le recordamos que su control periódico de [Hipertensión Arterial / Diabetes] corresponde para el día [Fecha] a las [Hora] en el consultorio [Consultorio]. Por favor acérquese con 15 minutos de anticipación. Si no puede asistir, responda este mensaje para reprogramar su turno. ¡Cuidar su salud es nuestro compromiso!»*
