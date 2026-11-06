# GUÍA TÉCNICA CLÍNICA: INICIATIVA HEARTS EN EL PERÚ
## Algoritmos de Seguimiento, Periodicidad de Citas (30 vs. 90 Días) y Semáforo de Alertas
### Estrategia para Hipertensión Arterial (CIE-10: I10 a I15) y Diabetes Mellitus (CIE-10: E10 a E14; la vía HEARTS trata la tipo 2, E11)

> **Estado de esta guía (06/11/2026).** Es una guía **interna del proyecto**, no la norma. Se contrastó con la vía HEARTS, el PP 0018 2026 y el manual HIS 2025 **según el resumen de la skill de dominio** (`dominio-salud-peru:enfermedades-cronicas-peru`, corte 12-oct-2026). **[PENDIENTE: cotejar con el texto íntegro de la vía HEARTS (RD de la DGIESP) y del manual HIS; el corpus de Edward no estuvo disponible para la sesión.]**
>
> **Qué cambió el 06/11/2026 (para que coincida con la vía):**
> - HbA1c: **< 7 %** (antes «≤ 7,0 %»). En adultos mayores o con comorbilidad grave la vía admite < 8 %.
> - Meta de PA en alto riesgo: **sistólica < 130** (antes «< 130/80»); la vía no fija una diastólica distinta de la general (< 90). Alto riesgo = enfermedad cardiovascular, diabetes, ERC o riesgo CV ≥ 10 %.
> - Se quitó el «o glucosa en ayunas < 130» de la vía: esa regla («dos glucemias de 70 a 130 **o** HbA1c < 7 %») es del **PP 0018 2026**, no de la vía.
> - Se agregaron las cuatro definiciones de «paciente controlado», los exámenes de seguimiento y los diagnósticos que cubre el programa.
> - La plantilla de WhatsApp refleja lo implementado (sin nombre, diagnóstico ni hora, y con consentimiento).
>
> Las reglas que usa el sistema están en **un solo lugar**: `client/js/clinical/reglasClinicas.js`. Si esta guía cambia, cambia ese archivo.

---

## 1. Fundamento de la Iniciativa HEARTS (MINSA / OPS)

La **Iniciativa HEARTS en las Américas**, implementada en el Perú por el Ministerio de Salud (MINSA) a través de la Dirección de Prevención y Control de Enfermedades No Transmisibles, Raras y Huérfanas (DENOT), busca estandarizar y simplificar el tratamiento de las enfermedades cardiovasculares y metabólicas en el primer y segundo nivel de atención.

El pilar fundamental es la **Vía Clínica Estandarizada**, la cual reemplaza esquemas terapéuticos heterogéneos por combinaciones farmacológicas a dosis fijas y un protocolo predecible de citas médicas y entrega de medicamentos.

---

## 2. Definición Clínica de la Periodicidad: ¿Por qué 30 Días vs. 90 Días?

La periodicidad de las citas no es una elección administrativa arbitraria, sino un imperativo de seguridad farmacológica y control hemodinámico:

```
                            ÁRBOL DE DECISIÓN CLÍNICA HEARTS
                            
                              Paciente con HTA (I10–I15) / DM (E10–E14)
                                              │
                                              ▼
                             ¿Cumple metas terapéuticas estables?
                             • PA < 140/90 mmHg (sistólica < 130 en alto riesgo: ECV, DM, ERC o riesgo CV ≥ 10 %)
                             • HbA1c < 7,0 % (adulto mayor o comorbilidad grave: se individualiza, < 8 %)
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

### Cuatro definiciones de «paciente controlado» en uso (todas con PA < 140/90)

Una misma persona puede estar controlada con una definición y no con otra: **todo tablero declara cuál usa**.

| Definición | Regla | Fuente |
|---|---|---|
| HEARTS | La última medición del año está en meta | Vía HEARTS |
| Manual HIS | Las tres últimas mediciones en meta (se exigen al menos tres) | Manual HIS 2025 |
| PP 0018 2026 | Hipertenso: 4 de 6 controles consecutivos < 140/90. Diabético: dos glucemias de 70 a 130 **o** HbA1c < 7 % | Definiciones operacionales del PP 0018 2026 |
| SIS IP04 | Al menos dos controles de enero a agosto y una presión en meta | Convenio SIS–GORE, ficha IP04 |

El manual HIS 2025 dice además: control **mensual hasta llegar a la meta y trimestral con tres controles en meta**; receta para tres meses (máximo 3 en el registro).

### Exámenes de seguimiento (vía HEARTS)

| Examen | Frecuencia |
|---|---|
| HbA1c | Cada 6 meses (el sistema usa 12 mientras la licenciada no confirme; pregunta 17 del informe F3) |
| Creatinina, TFGe, albuminuria y perfil lipídico | Cada año |
| Examen del pie | Cada año |
| Fondo de ojo | Cada 1 a 2 años |

### Diagnósticos que cubre el programa

Manual HIS 2025, «códigos más usados»: hipertensión I10, I11.0 e I11.9; diabetes E10.x, E11.0 a E11.9, E13 y E14. El padrón del sistema admite I10 a I15 y E10 a E14. **[PENDIENTE: confirmar con la licenciada si entra la diabetes tipo 1 (E10).]**

---

## 3. Matriz del Semáforo de Alertas y Acciones Sanitarias

El aplicativo calcula diariamente para cada paciente los **días transcurridos desde su última cita** y los **días restantes hasta su próxima fecha límite**:

| Color del Semáforo | Condición Temporal | Estado Clínico | Acción Sanitaria Inmediata |
| :---: | :--- | :--- | :--- |
| 🟢 **VERDE (Vigente)** | Faltan > 7 días para la fecha límite de control | Paciente con cita y medicación al día según su pauta (30 o 90 d) | Monitoreo pasivo en el sistema. |
| 🟡 **AMARILLO (Próximo)** | Faltan de 0 a 7 días para el vencimiento (el día de la cita es amarillo) | Riesgo de interrupción del tratamiento | **Disparador de Pre-cita en HOSIX/Galenhos.** Envío de recordatorio por WhatsApp / llamada de telemonitoreo para asegurar asistencia. |
| 🔴 **ROJO (Vencido / Inasistente)** | Superó la fecha límite (≥ 1 día de vencimiento) | **DESERCIÓN DEL PROGRAMA.** Alto riesgo de eventos adversos (crisis hipertensiva, cetoacidosis, ACV, IAM) | **Alerta Crítica.** Generación de orden de visita domiciliaria para agentes comunitarios / promotores de salud y contacto telefónico prioritario. |
| ⚪ **GRIS (Nuevo / Sin Cita)** | Paciente registrado sin cita programada, **o que asistió a su última cita y aún no tiene otra** | Pendiente de enrolamiento en el protocolo HEARTS | Convocatoria para triaje y consulta de primera vez. |

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

### Plantilla de Notificación por WhatsApp (la que implementa el sistema):
> *«HOSPITAL DE APOYO HUARMEY — Estimado(a) paciente: Le recordamos que su control periódico corresponde para la fecha [fecha de su próxima cita]. Lugar: [establecimiento]. Por favor responda a este mensaje con un 1 para CONFIRMAR su asistencia o un 2 para REPROGRAMAR su turno.»*

Decisiones de privacidad (Ley N.° 29733), distintas de la versión anterior de esta guía:
- El mensaje **no lleva nombre, diagnóstico ni hora**: va por un tercero (WhatsApp) y solo con **consentimiento registrado** del paciente.
- La fecha es la de su **próxima cita real**; si el paciente no tiene cita, no se envía el aviso.
- No se envía a pacientes fallecidos.
