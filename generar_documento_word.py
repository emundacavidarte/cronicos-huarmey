# -*- coding: utf-8 -*-
"""
Script para generar el Documento Técnico y Conceptual del Prototipo en formato Word (.docx)
MÁXIME Consultoría en Salud - Puesta en Marcha de Hospitales
Sistema Territorial de Crónicos Huarmey (v3.0)
"""

import os
import docx
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

def set_cell_background(cell, fill_hex):
    """Establece color de fondo de una celda."""
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    """Establece márgenes internos de una celda en dxa."""
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = parse_xml(
        f'<w:tcMar {nsdecls("w")}>'
        f'<w:top w:w="{top}" w:type="dxa"/>'
        f'<w:bottom w:w="{bottom}" w:type="dxa"/>'
        f'<w:left w:w="{left}" w:type="dxa"/>'
        f'<w:right w:w="{right}" w:type="dxa"/>'
        f'</w:tcMar>'
    )
    tcPr.append(tcMar)

def add_callout(doc, text, title="NOTA CLAVE", border_color="0D9488", bg_color="F0FDFA"):
    """Crea una caja de texto destacada estilo callout."""
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    
    cell = table.cell(0, 0)
    cell.width = Inches(6.5)
    set_cell_background(cell, bg_color)
    set_cell_margins(cell, top=120, bottom=120, left=180, right=180)
    
    # Borde izquierdo grueso, sin bordes en top, bottom, right
    tcPr = cell._tc.get_or_add_tcPr()
    tcBorders = parse_xml(
        f'<w:tcBorders {nsdecls("w")}>'
        f'<w:top w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
        f'<w:left w:val="single" w:sz="24" w:space="0" w:color="{border_color}"/>'
        f'<w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
        f'<w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
        f'</w:tcBorders>'
    )
    tcPr.append(tcBorders)
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.line_spacing = 1.15
    run_title = p.add_run(f"📌 {title}: ")
    run_title.bold = True
    run_title.font.name = "Calibri"
    run_title.font.size = Pt(10)
    run_title.font.color.rgb = RGBColor(0x0F, 0x76, 0x6E)
    
    run_text = p.add_run(text)
    run_text.font.name = "Calibri"
    run_text.font.size = Pt(9.5)
    run_text.font.color.rgb = RGBColor(0x1F, 0x29, 0x37)
    
    doc.add_paragraph().paragraph_format.space_after = Pt(4)

def format_table(table, col_widths, headers, data, header_bg="1E3A8A"):
    """Formatea una tabla con estilo corporativo y ancho de columnas."""
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    
    # Encabezados
    hdr_row = table.rows[0]
    for i, title in enumerate(headers):
        cell = hdr_row.cells[i]
        cell.width = col_widths[i]
        set_cell_background(cell, header_bg)
        set_cell_margins(cell, top=100, bottom=100, left=120, right=120)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(2)
        p.paragraph_format.space_after = Pt(2)
        run = p.add_run(title)
        run.bold = True
        run.font.name = "Calibri"
        run.font.size = Pt(9.5)
        run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        
    # Filas de datos
    for row_idx, row_data in enumerate(data):
        row = table.add_row()
        bg_color = "F8FAFC" if row_idx % 2 == 1 else "FFFFFF"
        for col_idx, val in enumerate(row_data):
            cell = row.cells[col_idx]
            cell.width = col_widths[col_idx]
            set_cell_background(cell, bg_color)
            set_cell_margins(cell, top=80, bottom=80, left=100, right=100)
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            p = cell.paragraphs[0]
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.line_spacing = 1.15
            run = p.add_run(str(val))
            run.font.name = "Calibri"
            run.font.size = Pt(9)
            run.font.color.rgb = RGBColor(0x33, 0x41, 0x55)
            # Centrar columnas cortas
            if col_widths[col_idx] <= Inches(1.2):
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER

def create_document():
    doc = Document()
    
    # Configuración de márgenes: Normal (1 pulgada = 2.54 cm)
    for section in doc.sections:
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin = Inches(1.0)
        section.right_margin = Inches(1.0)
        
        # Encabezado y pie de página
        footer = section.footer
        p_ft = footer.paragraphs[0]
        p_ft.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        r_ft = p_ft.add_run("MÁXIME Consultoría en Salud | Sistema Territorial de Crónicos Huarmey v3.0")
        r_ft.font.name = "Calibri"
        r_ft.font.size = Pt(8.5)
        r_ft.font.color.rgb = RGBColor(0x94, 0xA3, 0xB8)
        
        header = section.header
        p_hd = header.paragraphs[0]
        p_hd.alignment = WD_ALIGN_PARAGRAPH.LEFT
        r_hd = p_hd.add_run("DOCUMENTO TÉCNICO Y CONCEPTUAL DEL PROTOTIPO")
        r_hd.font.name = "Calibri"
        r_hd.font.size = Pt(8.5)
        r_hd.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)

    # -------------------------------------------------------------
    # PORTADA / ENCABEZADO PRINCIPAL
    # -------------------------------------------------------------
    p_meta = doc.add_paragraph()
    p_meta.paragraph_format.space_before = Pt(0)
    p_meta.paragraph_format.space_after = Pt(4)
    r_tag = p_meta.add_run("MÁXIME CONSULTORÍA EN SALUD • DIVISIÓN DE SALUD DIGITAL Y PUESTA EN MARCHA")
    r_tag.bold = True
    r_tag.font.name = "Calibri"
    r_tag.font.size = Pt(9.5)
    r_tag.font.color.rgb = RGBColor(0x0D, 0x94, 0x88) # Teal accent

    p_title = doc.add_paragraph()
    p_title.paragraph_format.space_before = Pt(2)
    p_title.paragraph_format.space_after = Pt(6)
    r_title = p_title.add_run("SISTEMA TERRITORIAL DE GESTIÓN Y SEGUIMIENTO DE PACIENTES CRÓNICOS")
    r_title.bold = True
    r_title.font.name = "Calibri"
    r_title.font.size = Pt(22)
    r_title.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A) # Deep Navy

    p_sub = doc.add_paragraph()
    p_sub.paragraph_format.space_before = Pt(0)
    p_sub.paragraph_format.space_after = Pt(14)
    r_sub = p_sub.add_run("Memoria Técnica, Arquitectura Funcional y Complemento al Audio Explicativo del Prototipo")
    r_sub.font.name = "Calibri"
    r_sub.font.size = Pt(13)
    r_sub.font.color.rgb = RGBColor(0x47, 0x55, 0x69) # Slate

    # Fila de metadatos del proyecto
    tbl_meta = doc.add_table(rows=1, cols=3)
    tbl_meta.alignment = WD_TABLE_ALIGNMENT.CENTER
    widths_meta = [Inches(2.1), Inches(2.2), Inches(2.2)]
    meta_items = [
        ("ÁMBITO PILOTO", "Nuevo Hospital de Apoyo Huarmey (II-1)\nRed Pacífico Sur (RIS N° 156)"),
        ("INTEGRACIÓN HCE", "HOSIX (SIVSA) / Galenos (MINSA)\nEstándar HL7 FHIR R4 & GeoRIS"),
        ("VERSIÓN Y FECHA", "Versión 3.0 Auditada\nOctubre 2026")
    ]
    for i, (k, v) in enumerate(meta_items):
        c = tbl_meta.cell(0, i)
        c.width = widths_meta[i]
        set_cell_background(c, "F1F5F9")
        set_cell_margins(c, 80, 80, 100, 100)
        p = c.paragraphs[0]
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(0)
        rk = p.add_run(k + "\n")
        rk.bold = True
        rk.font.name = "Calibri"
        rk.font.size = Pt(8.5)
        rk.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)
        rv = p.add_run(v)
        rv.font.name = "Calibri"
        rv.font.size = Pt(8.5)
        rv.font.color.rgb = RGBColor(0x33, 0x41, 0x55)

    doc.add_paragraph().paragraph_format.space_after = Pt(12)

    # -------------------------------------------------------------
    # SECCIÓN 1: PLANTEAMIENTO DEL PROBLEMA Y JUSTIFICACIÓN SANITARIA
    # -------------------------------------------------------------
    h1 = doc.add_paragraph()
    h1.paragraph_format.space_before = Pt(16)
    h1.paragraph_format.space_after = Pt(6)
    rh1 = h1.add_run("1. PLANTEAMIENTO DEL PROBLEMA Y REALIDAD SANITARIA")
    rh1.bold = True
    rh1.font.name = "Calibri"
    rh1.font.size = Pt(14)
    rh1.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)

    p1 = doc.add_paragraph()
    p1.paragraph_format.line_spacing = 1.15
    p1.paragraph_format.space_after = Pt(6)
    p1.add_run(
        "En el sistema público de salud del Perú, el manejo de pacientes con Enfermedades No Transmisibles (ENT) —principalmente "
        "Hipertensión Arterial (HTA), Diabetes Mellitus tipo 2 (DM2) y Enfermedad Renal Crónica (ERC)— responde a un circuito continuo "
        "entre niveles de atención. Los pacientes inician su captación y control en el Primer Nivel de Atención (postas y centros de salud I-1 a I-4). "
        "Cuando se descompensan, presentan sospecha de daño de órgano blanco o requieren estratificación especializada, son referidos "
        "al Segundo Nivel de Atención (Hospital II-1). Una vez evaluados y estabilizados por el médico internista o especialista, el hospital "
        "debe contra-referirlos hacia su establecimiento de salud de origen para continuar su tratamiento farmacológico habitual y monitoreo mensual o progresivo."
    )

    p2 = doc.add_paragraph()
    p2.paragraph_format.line_spacing = 1.15
    p2.paragraph_format.space_after = Pt(6)
    p2.add_run(
        "Sin embargo, existe un cuello de botella estructural identificado con absoluta precisión en el trabajo de campo: "
    )
    r_alert = p2.add_run(
        "no existe a la fecha una normativa técnica nacional que estandarice qué variables, columnas y formatos obligatorios "
        "debe contener el Padrón Nominal de Pacientes Crónicos. "
    )
    r_alert.bold = True
    p2.add_run(
        "Como consecuencia de este vacío regulatorio, cada establecimiento de salud —tanto del primer nivel como del segundo nivel "
        "con población adscrita, tal como el Hospital de Apoyo Huarmey— crea y gestiona su propia hoja de cálculo en Excel de forma aislada e improvisada."
    )

    add_callout(
        doc,
        "La dispersión de padrones en múltiples archivos Excel no estandarizados genera tres consecuencias críticas: "
        "(1) Imposibilidad de interoperabilidad entre el hospital y las 12 postas de la red, rompiendo el flujo de contrarreferencia; "
        "(2) Pérdida total de la trazabilidad y continuidad asistencial cuando un paciente migra entre distritos o jurisdicciones; "
        "(3) Saturación crítica de la consulta externa del nuevo Hospital II-1 (>11,325 m²) por pacientes crónicos estables que acuden "
        "únicamente a renovar recetas, consumiendo horas médicas de especialidad y generando deserción silenciosa (>70%).",
        title="EL DOLOR OPERACIONAL IDENTIFICADO EN EL AUDIO",
        border_color="DC2626",
        bg_color="FEF2F2"
    )

    # -------------------------------------------------------------
    # SECCIÓN 2: PROPUESTA DE VALOR Y OBJETIVOS DEL PROTOTIPO
    # -------------------------------------------------------------
    h2 = doc.add_paragraph()
    h2.paragraph_format.space_before = Pt(14)
    h2.paragraph_format.space_after = Pt(6)
    rh2 = h2.add_run("2. PROPUESTA DE VALOR: EL PROTOTIPO MÁXIME")
    rh2.bold = True
    rh2.font.name = "Calibri"
    rh2.font.size = Pt(14)
    rh2.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)

    p3 = doc.add_paragraph()
    p3.paragraph_format.line_spacing = 1.15
    p3.paragraph_format.space_after = Pt(6)
    p3.add_run(
        "Para responder a esta brecha, MÁXIME Consultoría en Salud ha desarrollado una herramienta tecnológica de puesta en marcha "
        "diseñada específicamente para articular el hospital nuevo con su red territorial de primer nivel. El prototipo no pretende "
        "ser 'otro software más' que duplique el trabajo del personal clínico, ni busca reemplazar la Historia Clínica Electrónica (HCE) "
        "hospitalaria (HOSIX en Huarmey o Galenos en otros establecimientos). Su propósito es ser el "
    )
    r_p3_b = p3.add_run("Cerebro Territorial de Articulación y Gestión del Padrón Nominal.")
    r_p3_b.bold = True

    # Cuadro resumen de objetivos
    tbl_obj = doc.add_table(rows=1, cols=2)
    widths_obj = [Inches(2.2), Inches(4.3)]
    obj_headers = ["Pilar del Prototipo", "Descripción y Aporte Operacional"]
    obj_data = [
        ("1. Estandarización del Padrón Nominal", "Definición de una estructura unificada de columnas sustentada en normas técnicas MINSA y la iniciativa HEARTS (OPS/OMS), idéntica para todas las IPRESS de la red."),
        ("2. Modalidad Dual (Nube / Excel)", "Operatividad flexible: registro web directo con almacenamiento seguro en la nube para postas con internet, y compatibilidad bidireccional con hojas Excel para postas remotas."),
        ("3. Validador Interactivo de Columnas", "Módulo inteligente que analiza la estructura del Excel cargado, detecta inconsistencias o columnas faltantes y ofrece una ventana interactiva de conciliación previa al ingreso."),
        ("4. Georreferenciación y GeoRIS", "Localización cartográfica real de los 550 pacientes auditados en Huarmey sobre el trazado vial y catastral oficial, vinculados a su IPRESS y sector sanitario bajo el D.S. 019-2024-SA."),
        ("5. Cálculo Clínico Automatizado", "Diferenciación entre columnas de entrada obligatoria y columnas calculadas automáticamente por el sistema (edad, semáforo dinámico, fechas de control y riesgo)."),
        ("6. Cruce de Datos como Historial", "Indexación única por DNI que consolida atenciones sucesivas en una línea de tiempo longitudinal del paciente, sin sobrecargar la plataforma como HCE compleja."),
        ("7. Seguridad por Roles Territoriales", "Acceso granular donde cada usuario visualiza y opera únicamente los pacientes de su jurisdicción (sector sanitario, posta o cabecera provincial)."),
        ("8. Ficha HEARTS y Dashboard", "Ficha clínica individualizada estructurada en 5 pilares y panel gerencial con indicadores clave para la evaluación de Convenios de Gestión sanitaria.")
    ]
    format_table(tbl_obj, widths_obj, obj_headers, obj_data, header_bg="1E3A8A")
    doc.add_paragraph().paragraph_format.space_after = Pt(6)

    # -------------------------------------------------------------
    # SECCIÓN 3: ESTANDARIZACIÓN DEL PADRÓN NOMINAL DE CRÓNICOS
    # -------------------------------------------------------------
    h3 = doc.add_paragraph()
    h3.paragraph_format.space_before = Pt(14)
    h3.paragraph_format.space_after = Pt(6)
    rh3 = h3.add_run("3. ESTANDARIZACIÓN DEL PADRÓN NOMINAL: ESTRUCTURA DE VARIABLES")
    rh3.bold = True
    rh3.font.name = "Calibri"
    rh3.font.size = Pt(14)
    rh3.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)

    p4 = doc.add_paragraph()
    p4.paragraph_format.line_spacing = 1.15
    p4.paragraph_format.space_after = Pt(6)
    p4.add_run(
        "Tal como se enfatiza en el audio explicativo, el núcleo de la solución consiste en estandarizar el padrón nominal "
        "con una relación de columnas exhaustiva, técnica y homogénea para el primer nivel (todas las postas de la red) y el segundo nivel "
        "(Hospital de Huarmey II-1). Para simplificar la digitación y eliminar errores de trascripción, el padrón divide sus variables en dos grupos:"
    )

    # Subsección 3.1: Columnas de Entrada
    h31 = doc.add_paragraph()
    h31.paragraph_format.space_before = Pt(8)
    h31.paragraph_format.space_after = Pt(4)
    rh31 = h31.add_run("3.1. Columnas de Registro Obligatorio (Campos de Entrada)")
    rh31.bold = True
    rh31.font.name = "Calibri"
    rh31.font.size = Pt(11)
    rh31.font.color.rgb = RGBColor(0x25, 0x63, 0xEB)

    p_in = doc.add_paragraph()
    p_in.paragraph_format.line_spacing = 1.15
    p_in.paragraph_format.space_after = Pt(4)
    p_in.add_run(
        "Son los datos primarios que el personal asistencial o el digitador debe registrar obligatoriamente al atender al paciente o al importar desde su sistema local:"
    )

    tbl_cols_in = doc.add_table(rows=1, cols=3)
    w_cols_in = [Inches(1.5), Inches(1.8), Inches(3.2)]
    h_cols_in = ["Variable", "Tipo / Formato", "Descripción y Criterio Técnico"]
    d_cols_in = [
        ("NRO_DOCUMENTO", "Texto (8 dígitos DNI)", "Documento Nacional de Identidad. Clave primaria única del paciente en todo el sistema territorial."),
        ("HISTORIA_CLINICA", "Texto alfanumérico", "Número de Historia Clínica asignada en el establecimiento o en el sistema HOSIX / Galenos."),
        ("APELLIDOS_NOMBRES", "Texto libre", "Nombre completo según RENIEC para evitar homonimias."),
        ("SEXO", "F / M", "Sexo biológico para ajuste de perfiles de riesgo cardiovascular y metas clínicas."),
        ("FECHA_NACIMIENTO", "Fecha (AAAA-MM-DD)", "Fecha exacta de nacimiento para el cómputo automático de la edad y grupos etarios."),
        ("TELEFONO", "Numérico (9 dígitos)", "Número celular prioritario para el envío automatizado de recordatorios por WhatsApp."),
        ("DIRECCION", "Texto descriptivo", "Dirección de residencia habitual, manzana, lote o centro poblado en Huarmey."),
        ("SECTOR_SANITARIO", "Categoría normalizada", "Sector de salud territorial (Miramar, Santo Domingo, La Victoria, Puerto Huarmey, Culebras, etc.)."),
        ("COD_IPRESS_ORIGEN", "Numérico (RENAES)", "Código de la IPRESS adscrita donde el paciente recibe sus controles y medicamentos."),
        ("CIE10_COD", "Código CIE-10", "Diagnóstico principal: I10 (Hipertensión Esencial), E11 (Diabetes Mellitus Tipo 2), N18 (ERC)."),
        ("FEC_ULTIMA_ATENCION", "Fecha (AAAA-MM-DD)", "Fecha de la consulta médica o control más reciente realizado al paciente."),
        ("PA_SISTOLICA / DIAST.", "Numérico (mmHg)", "Medición basal de la Presión Arterial en el último control (ej. 130 / 80 mmHg)."),
        ("GLUCOSA / HBA1C", "Numérico (mg/dL o %)", "Glicemia basal y Hemoglobina Glicosilada reportada en analítica de laboratorio.")
    ]
    format_table(tbl_cols_in, w_cols_in, h_cols_in, d_cols_in, header_bg="2563EB")
    doc.add_paragraph().paragraph_format.space_after = Pt(6)

    # Subsección 3.2: Columnas Calculadas Automáticamente
    h32 = doc.add_paragraph()
    h32.paragraph_format.space_before = Pt(8)
    h32.paragraph_format.space_after = Pt(4)
    rh32 = h32.add_run("3.2. Columnas Calculadas Automáticamente por el Sistema")
    rh32.bold = True
    rh32.font.name = "Calibri"
    rh32.font.size = Pt(11)
    rh32.font.color.rgb = RGBColor(0x0D, 0x94, 0x88)

    p_calc = doc.add_paragraph()
    p_calc.paragraph_format.line_spacing = 1.15
    p_calc.paragraph_format.space_after = Pt(4)
    p_calc.add_run(
        "Estas columnas NO deben ser ingresadas manualmente. El motor del prototipo las computa en tiempo de ejecución "
        "garantizando consistencia clínica y evitando errores humanos de apreciación:"
    )

    tbl_cols_calc = doc.add_table(rows=1, cols=3)
    w_cols_calc = [Inches(1.6), Inches(1.8), Inches(3.1)]
    h_cols_calc = ["Variable Calculada", "Fórmula / Regla Técnica", "Impacto Operacional"]
    d_cols_calc = [
        ("EDAD_ACTUAL", "Diferencia exacta entre Fecha_Nacimiento y fecha actual", "Mantiene actualizada la edad sin desfases anuales típicos de Excels estáticos."),
        ("ESTADO_CONTROL", "Si PA < 140/90 y HbA1c <= 7% -> CONTROLADO;\nSi no -> NO CONTROLADO", "Aplica el umbral médico oficial HEARTS para estratificar la conducta médica."),
        ("VENTANA_SEGUIMIENTO", "Si CONTROLADO: 90 días;\nSi NO CONTROLADO: 30 días", "Determina si el paciente recoge medicación trimestral o requiere ajuste mensual en hospital."),
        ("FEC_LIMITE_CONTROL", "FEC_ULTIMA_ATENCION + Ventana (30 o 90 días)", "Establece la fecha límite para evitar el abandono del tratamiento farmacológico."),
        ("DIAS_RESTANTES", "FEC_LIMITE_CONTROL - Fecha del día (hora local Perú)", "Cálculo en vivo sin desfase de zona horaria UTC para gestión de alertas."),
        ("SEMAFORO_TERRITORIAL", "VERDE: Días >= 7 y Controlado\nAMARILLO: 0 <= Días < 7\nROJO: Días < 0 (Inasistente/Desertor)\nNEGRO: Fallecido", "Semáforo visual dinámico que enciende los pines del mapa y alimenta las brigadas comunitarias."),
        ("CANAL_DERIVACION", "Si CONTROLADO -> Posta I-1 a I-4 / Teleconsulta;\nSi NO CONTROLADO -> Hospital II-1 Especialidad", "Regla de oro de la puesta en marcha: descongestiona la consulta externa hospitalaria.")
    ]
    format_table(tbl_cols_calc, w_cols_calc, h_cols_calc, d_cols_calc, header_bg="0D9488")
    doc.add_paragraph().paragraph_format.space_after = Pt(6)

    # Subsección 3.3: Cruce e Historial de Pacientes
    h33 = doc.add_paragraph()
    h33.paragraph_format.space_before = Pt(8)
    h33.paragraph_format.space_after = Pt(4)
    rh33 = h33.add_run("3.3. Cruce de Datos y Generación de Historial (Sin ser una HCE Pesada)")
    rh33.bold = True
    rh33.font.name = "Calibri"
    rh33.font.size = Pt(11)
    rh33.font.color.rgb = RGBColor(0x47, 0x55, 0x69)

    p_cruce = doc.add_paragraph()
    p_cruce.paragraph_format.line_spacing = 1.15
    p_cruce.paragraph_format.space_after = Pt(6)
    p_cruce.add_run(
        "Un principio fundamental destacado por el autor del audio es la simplicidad y eficiencia de la información: "
        "el aplicativo no pretende ser una Historia Clínica Electrónica completa —lo cual añadiría una carga burocrática inmensa "
        "al médico— sino un sistema ágil de seguimiento territorial. Cuando el sistema recibe un registro cuyo DNI ya existe en la base de datos, "
        "no genera una fila duplicada (como ocurría en los Excels originales, donde se encontraron 64 DNI duplicados en 128 filas). "
        "En su lugar, el sistema cruza la información, actualiza las cifras de control más recientes y almacena la atención previa como "
    )
    r_cruce_b = p_cruce.add_run("historial cronológico de mediciones del paciente. ")
    r_cruce_b.bold = True
    p_cruce.add_run(
        "Esto permite que cualquier médico o enfermera de la red visualice en segundos la curva evolutiva de su presión arterial y glucosa."
    )

    # -------------------------------------------------------------
    # SECCIÓN 4: MODALIDAD DUAL DE OPERACIÓN (EN LÍNEA Y CONTINGENCIA EXCEL)
    # -------------------------------------------------------------
    h4 = doc.add_paragraph()
    h4.paragraph_format.space_before = Pt(14)
    h4.paragraph_format.space_after = Pt(6)
    rh4 = h4.add_run("4. MODALIDAD DUAL DE OPERACIÓN: EN LÍNEA Y CONTINGENCIA EXCEL")
    rh4.bold = True
    rh4.font.name = "Calibri"
    rh4.font.size = Pt(14)
    rh4.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)

    p5 = doc.add_paragraph()
    p5.paragraph_format.line_spacing = 1.15
    p5.paragraph_format.space_after = Pt(6)
    p5.add_run(
        "La geografía de la provincia de Huarmey y la Red Pacífico Sur combina centros de salud urbanos con conectividad estable "
        "(como el Hospital II-1 Huarmey o el C.S. La Victoria) y puestos de salud periféricos en zonas rurales o valles donde internet "
        "es intermitente o inexistente. Con un criterio de ingeniería pragmática, el prototipo implementa dos modalidades de funcionamiento:"
    )

    tbl_dual = doc.add_table(rows=1, cols=2)
    w_dual = [Inches(3.2), Inches(3.3)]
    h_dual = ["MODALIDAD A: CONECTIVIDAD WEB (EN LÍNEA)", "MODALIDAD B: OFFLINE Y CONTINGENCIA EXCEL"]
    d_dual = [
        (
            "• Ingreso Directo en Plataforma Web:\n"
            "El personal de salud accede a la aplicación interactiva mediante credenciales seguras.\n\n"
            "• Almacenamiento Centralizado en la Nube:\n"
            "Los registros se persisten de forma instantánea bajo protocolos de cifrado y auditoría de seguridad.\n\n"
            "• Exportación Dinámica a Excel:\n"
            "En cualquier momento, el usuario puede descargar el padrón nominal completo o filtrado por su sector en formato Excel oficial estandarizado, permitiendo llevarlo consigo a visitas domiciliarias o zonas sin señal.\n\n"
            "• Tecnología PWA (Progressive Web App):\n"
            "Gracias al Service Worker integrado, la aplicación se puede instalar como app en tablets o celulares Android y consultar mapas y padrones previamente cacheados sin conexión."
            ,
            "• Trabajo Habitual en Hoja de Cálculo:\n"
            "En postas sin internet, el personal continúa registrando sus atenciones en la plantilla oficial de Excel con columnas estandarizadas.\n\n"
            "• Validador y Conciliador Interactivo de Columnas:\n"
            "Al conectarse a la red, el usuario sube el archivo Excel. El sistema ejecuta una verificación automática de cabeceras.\n\n"
            "• Ventana Emergente de Corrección en Vivo:\n"
            "Si una columna tiene un nombre alterado, falta un campo obligatorio o el formato es incorrecto, el sistema NO rechaza el archivo a ciegas; abre una ventana interactiva donde señala el error y permite al usuario corregir o mapear la columna en pantalla antes de completar la subida.\n\n"
            "• Georreferenciación Automática Inmediata:\n"
            "Una vez confirmado el mapeo, el sistema ingesta las filas, cruza historiales y enciende los pacientes en el mapa."
        )
    ]
    format_table(tbl_dual, w_dual, h_dual, d_dual, header_bg="1E3A8A")
    doc.add_paragraph().paragraph_format.space_after = Pt(6)

    # -------------------------------------------------------------
    # SECCIÓN 5: GEORREFERENCIACIÓN Y ZONIFICACIÓN TERRITORIAL (GeoRIS)
    # -------------------------------------------------------------
    h5 = doc.add_paragraph()
    h5.paragraph_format.space_before = Pt(14)
    h5.paragraph_format.space_after = Pt(6)
    rh5 = h5.add_run("5. MOTOR DE GEORREFERENCIACIÓN Y ZONIFICACIÓN SANITARIA")
    rh5.bold = True
    rh5.font.name = "Calibri"
    rh5.font.size = Pt(14)
    rh5.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)

    p6 = doc.add_paragraph()
    p6.paragraph_format.line_spacing = 1.15
    p6.paragraph_format.space_after = Pt(6)
    p6.add_run(
        "A diferencia de las hojas Excel tradicionales que son 'ciegas' al territorio, el prototipo incorpora un potente motor GIS "
        "sustentado en la normativa oficial de Redes Integradas de Salud (D.S. 019-2024-SA):"
    )

    p6_pts = [
        ("Base Cartográfica GeoRIS Áncash Precargada: ", "Integra las 6 Redes de Salud de la región, las 20 provincias, los 166 distritos y las 620 IPRESS clasificadas según su rol resolutivo (Puertas de Entrada I-1/I-2, Cabeceras de Zona I-3/I-4 y Hospitales de Área II-1)."),
        ("Catastro Urbano y Trazado Vial de Huarmey: ", "Cuenta con 6,384 lotes urbanos georreferenciados y la red vial con sentidos de tránsito, permitiendo ubicar al paciente exactamente frente a su manzana de residencia."),
        ("Emplazamiento Oficial del Nuevo Hospital Huarmey II-1: ", "Ubicado en su polígono real de 11,325.98 m² en el sector Santo Domingo Ampliación / Miramar (detrás del Hotel La Siesta), constituyendo el nodo central de la red tributaria."),
        ("Población Georreferenciada Real (550 Pacientes): ", "El mapa despliega 413 pacientes del Padrón Nominal DNT auditado más 137 pacientes de la Brecha de Captación HOSIX (atendidos en hospital pero aún no adscritos territorialmente)."),
        ("Inspector de Medición y Techos Resolutivos de Ley: ", "Herramienta que traza la ruta en vivo desde cualquier posta periférica (ej. Puerto Huarmey o Culebras) hasta el Hospital II-1, calcula la distancia en kilómetros, el tiempo de traslado en ambulancia y certifica el cumplimiento de los techos legales del D.S. 019-2024-SA (≤ 2 horas a cabecera, ≤ 4 horas a hospital).")
    ]
    for b_title, b_desc in p6_pts:
        p_pt = doc.add_paragraph(style='List Bullet')
        p_pt.paragraph_format.line_spacing = 1.15
        p_pt.paragraph_format.space_after = Pt(3)
        rb = p_pt.add_run(b_title)
        rb.bold = True
        rb.font.name = "Calibri"
        rb.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)
        rd = p_pt.add_run(b_desc)
        rd.font.name = "Calibri"

    # -------------------------------------------------------------
    # SECCIÓN 6: MODELO DE SEGURIDAD Y CONTROL DE ACCESO POR ROLES
    # -------------------------------------------------------------
    h6 = doc.add_paragraph()
    h6.paragraph_format.space_before = Pt(14)
    h6.paragraph_format.space_after = Pt(6)
    rh6 = h6.add_run("6. MODELO DE SEGURIDAD Y CONTROL DE ACCESO POR ROLES")
    rh6.bold = True
    rh6.font.name = "Calibri"
    rh6.font.size = Pt(14)
    rh6.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)

    p7 = doc.add_paragraph()
    p7.paragraph_format.line_spacing = 1.15
    p7.paragraph_format.space_after = Pt(6)
    p7.add_run(
        "Como se especifica taxativamente en el audio, la plataforma garantiza la confidencialidad y el orden sanitario mediante "
        "un esquema de control de acceso basado en roles territoriales (RBAC). Cada usuario autenticado cuenta con un perfil que "
        "delimita con precisión qué pacientes y datos puede visualizar y editar:"
    )

    tbl_roles = doc.add_table(rows=1, cols=3)
    w_roles = [Inches(1.8), Inches(2.2), Inches(2.5)]
    h_roles = ["Nivel de Rol", "Ámbito Territorial Asignado", "Privilegios y Restricciones de Acceso"]
    d_roles = [
        ("Rol Posta / Sector Sanitario", "Su propia IPRESS y sector adscrito (ej. P.S. Puerto Huarmey o Sector Miramar).", "Visualiza y actualiza únicamente los pacientes de su comunidad. No puede ver datos clínicos de otros sectores o distritos."),
        ("Rol Hospital II-1 / Especialidad", "Población tributaria adscrita al Hospital de Apoyo Huarmey y pacientes referidos.", "Acceso a interconsultas, gestión de pre-citas hospitalarias y contrarreferencia de crónicos estables hacia el primer nivel."),
        ("Rol Cabecera de Red / RIS Pacífico Sur", "Toda la provincia de Huarmey y las 12 IPRESS tributarias.", "Visión consolidada de la red, trazado de rutas de referencia, gestión de abastecimiento de fármacos y transferencias."),
        ("Rol Gerencial / Auditoría", "Ámbito regional de la RIS (Dirección Regional y Directivos).", "Visualización exclusiva de dashboards, reportes estadísticos agregados, convenios de gestión y logs de auditoría de seguridad.")
    ]
    format_table(tbl_roles, w_roles, h_roles, d_roles, header_bg="1E3A8A")
    doc.add_paragraph().paragraph_format.space_after = Pt(6)

    # -------------------------------------------------------------
    # SECCIÓN 7: FICHA CLÍNICA HEARTS Y PROTOCOLO ASISTENCIAL
    # -------------------------------------------------------------
    h7 = doc.add_paragraph()
    h7.paragraph_format.space_before = Pt(14)
    h7.paragraph_format.space_after = Pt(6)
    rh7 = h7.add_run("7. FICHA CLÍNICA HEARTS Y PROTOCOLO DE SEGUIMIENTO")
    rh7.bold = True
    rh7.font.name = "Calibri"
    rh7.font.size = Pt(14)
    rh7.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)

    p8 = doc.add_paragraph()
    p8.paragraph_format.line_spacing = 1.15
    p8.paragraph_format.space_after = Pt(6)
    p8.add_run(
        "Al seleccionar cualquier paciente en el mapa o en el padrón, el sistema despliega la "
    )
    r_f_b = p8.add_run("Ficha Clínica Individualizada HEARTS (MINSA / OPS). ")
    r_f_b.bold = True
    p8.add_run(
        "Esta ficha está diseñada bajo el principio de 'revelación progresiva' (progressive disclosure) y organiza los datos en cinco pilares independientes:"
    )

    f_pilares = [
        ("Pilar 1: Filiación y Aseguramiento: ", "DNI, Historia Clínica, Nombres, Sexo biológico, Fecha de nacimiento, Edad exacta y Tipo de seguro (SIS 96.1%, Particular 3.6%)."),
        ("Pilar 2: Ubicación y Contacto Verificado: ", "Teléfono validado de 9 dígitos, dirección de residencia, manzana/lote, sector territorial e IPRESS adscrita."),
        ("Pilar 3: Diagnósticos y Tratamiento Farmacológico: ", "Códigos CIE-10 confirmados (I10 Hipertensión, E11 Diabetes), medicación antihipertensiva (Enalapril, Losartán, Amlodipino) y antidiabética (Metformina, Glibenclamida, Insulina)."),
        ("Pilar 4: Parámetros Clínico-Metabólicos: ", "Cifras de Presión Arterial Sistólica/Diastólica, Glucosa Basal, Hemoglobina Glicosilada (HbA1c), Perfil Renal (Creatinina/Urea) y Perfil Lipídico (Colesterol/Triglicéridos)."),
        ("Pilar 5: Cronograma de Citas y Canales de Acción: ", "Fecha del último control, fecha de la próxima cita calculada, semáforo dinámico de riesgo y botones de acción inmediata:")
    ]
    for p_title, p_desc in f_pilares:
        p_fp = doc.add_paragraph(style='List Bullet')
        p_fp.paragraph_format.line_spacing = 1.15
        p_fp.paragraph_format.space_after = Pt(3)
        rb = p_fp.add_run(p_title)
        rb.bold = True
        rb.font.name = "Calibri"
        rb.font.color.rgb = RGBColor(0x0F, 0x76, 0x6E)
        rd = p_fp.add_run(p_desc)
        rd.font.name = "Calibri"

    add_callout(
        doc,
        "El sistema materializa el seguimiento asistencial a través de 3 salidas de acción inmediata:\n"
        "1. Medicamentos (Contrarreferencia): Identifica crónicos controlados para recojo de medicación habitual en su posta o vía telemonitoreo, descongestionando >30% de la consulta externa hospitalaria.\n"
        "2. WhatsApp Automatizado: Genera un mensaje institucional con un clic: 'Estimado(a) Sr(a). [Nombre], le recordamos su control de hipertensión en el Hospital de Huarmey para el [Fecha]. Confirme su cita'.\n"
        "3. Alertas para Brigadas de Búsqueda Activa: Filtra pacientes en Alerta Roja (desertores crónicos con cifras descompensadas) y exporta hojas de ruta geográficas por sector para rescate domiciliario preventivo antes de que sufran infarto o ACV.",
        title="LOS 3 CANALES DE ACCIÓN SANITARIA EN ACCIÓN",
        border_color="2563EB",
        bg_color="EFF6FF"
    )

    # -------------------------------------------------------------
    # SECCIÓN 8: DASHBOARD GERENCIAL Y CONVENIOS DE GESTIÓN
    # -------------------------------------------------------------
    h8 = doc.add_paragraph()
    h8.paragraph_format.space_before = Pt(14)
    h8.paragraph_format.space_after = Pt(6)
    rh8 = h8.add_run("8. DASHBOARD GERENCIAL Y CUMPLIMIENTO DE CONVENIOS DE GESTIÓN")
    rh8.bold = True
    rh8.font.name = "Calibri"
    rh8.font.size = Pt(14)
    rh8.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)

    p9 = doc.add_paragraph()
    p9.paragraph_format.line_spacing = 1.15
    p9.paragraph_format.space_after = Pt(6)
    p9.add_run(
        "Un componente de alto impacto gerencial señalado en el audio es el Dashboard Ejecutivo de Indicadores. "
        "En la gestión hospitalaria y de redes de salud, el cumplimiento de los "
    )
    r_cg = p9.add_run("Convenios de Gestión (suscritos entre el MINSA, el Gobierno Regional de Áncash y la RIS Pacífico Sur) ")
    r_cg.bold = True
    p9.add_run(
        "determina la asignación de presupuestos por desempeño, bonos de productividad institucional y metas sanitarias FED. "
        "El prototipo monitorea estos indicadores en tiempo real mediante su barra flotante superior (HUD):"
    )

    tbl_kpi = doc.add_table(rows=1, cols=4)
    w_kpi = [Inches(1.5), Inches(1.0), Inches(1.8), Inches(2.2)]
    h_kpi = ["Indicador HUD", "Valor Piloto", "Criterio Clínico / Operativo", "Impacto en Convenio de Gestión"]
    d_kpi = [
        ("👥 Total Padrón", "614 reg.\n(550 únicos)", "Universo de pacientes crónicos identificados en Huarmey.", "Línea de base oficial para metas de cobertura territorial."),
        ("🟢 En Meta HEARTS", "231 pac.", "Pacientes con PA < 140/90 y control vigente (ventana de 90 días).", "Indicador N° 1 de Convenio de Gestión: Porcentaje de hipertensos controlados."),
        ("🟡 Próximos a Vencer", "33 pac.", "Cita próxima a vencer dentro de los próximos 7 días.", "Indicador de Adherencia: Permite rescate oportuno antes de caer en abandono."),
        ("🔴 Deserción / Abandono", "213 pac.", "Cita vencida con presión o glucosa descompensada.", "Riesgo Cardiovascular Mayor: Foco directo para intervenciones de brigadas comunitarias."),
        ("🟣 Brecha HOSIX", "137 pac.", "Pacientes atendidos en hospital pendientes de asignación territorial.", "Indicador de Captación e Integración de Red: Cierre de brechas entre hospital y postas.")
    ]
    format_table(tbl_kpi, w_kpi, h_kpi, d_kpi, header_bg="1E3A8A")
    doc.add_paragraph().paragraph_format.space_after = Pt(6)

    # -------------------------------------------------------------
    # SECCIÓN 9: ARQUITECTURA TÉCNICA Y ESTADO DE CONSTRUCCIÓN
    # -------------------------------------------------------------
    h9 = doc.add_paragraph()
    h9.paragraph_format.space_before = Pt(14)
    h9.paragraph_format.space_after = Pt(6)
    rh9 = h9.add_run("9. ARQUITECTURA TÉCNICA Y ESTADO DE CONSTRUCCIÓN DEL PROTOTIPO")
    rh9.bold = True
    rh9.font.name = "Calibri"
    rh9.font.size = Pt(14)
    rh9.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)

    p10 = doc.add_paragraph()
    p10.paragraph_format.line_spacing = 1.15
    p10.paragraph_format.space_after = Pt(6)
    p10.add_run(
        "El prototipo se encuentra completamente construido, auditado y listo para ejecución local o en red institucional. "
        "A continuación se resumen sus especificaciones técnicas de ingeniería de software:"
    )

    tbl_tech = doc.add_table(rows=1, cols=3)
    w_tech = [Inches(1.8), Inches(2.2), Inches(2.5)]
    h_tech = ["Capa Tecnológica", "Tecnología Utilizada", "Detalle de Implementación"]
    d_tech = [
        ("Servidor / Backend", "Node.js (v20+) + Express", "Servidor de alta concurrencia, middleware de compresión Gzip, ETags, endpoints REST y logging de auditoría."),
        ("Estándar de Interoperabilidad", "HL7 FHIR R4 & LOINC v2.78", "Modelo agnóstico con CapabilityStatement, Bundle transaccional y recursos Patient, Condition, Appointment, Observation."),
        ("Interfaz de Usuario (Frontend)", "HTML5 + CSS3 Glassmorphism + Vanilla JS", "Arquitectura Single Page Application (SPA), carga asíncrona mediante Web Workers y renderizado ultrarrápido sin frameworks pesados."),
        ("Motor Cartográfico GIS", "Leaflet JS + GeoJSON vectorial", "Capas de calles OpenStreetMap, GeoRIS oficial Áncash, catastro urbano de 6,384 lotes e inspector de referencia en vivo."),
        ("Capacidad Móvil y Offline", "Progressive Web App (PWA) + Service Worker", "Manifiesto W3C (`manifest.json`), cache offline de capas base y posibilidad de instalación en smartphones y tablets Android."),
        ("Scripts de Aseguramiento", "Suite de herramientas Node.js en `/tools`", "Scripts de auditoría de consistencia, consolidación de DNI duplicados, verificación de semáforo sin sesgo UTC y control de RENIPRESS.")
    ]
    format_table(tbl_tech, w_tech, h_tech, d_tech, header_bg="1E3A8A")
    doc.add_paragraph().paragraph_format.space_after = Pt(8)

    # Instrucciones de ejecución rápida
    p_run = doc.add_paragraph()
    p_run.paragraph_format.line_spacing = 1.15
    p_run.paragraph_format.space_after = Pt(4)
    r_run_t = p_run.add_run("Instrucciones de Despliegue Inmediato (Localhost):")
    r_run_t.bold = True
    r_run_t.font.name = "Calibri"
    r_run_t.font.size = Pt(10.5)

    p_cmd = doc.add_paragraph()
    p_cmd.paragraph_format.line_spacing = 1.1
    p_cmd.paragraph_format.left_indent = Inches(0.3)
    p_cmd.paragraph_format.space_after = Pt(4)
    r_cmd = p_cmd.add_run(
        "1. Ejecutar el script automatizado: INICIAR_PROTOTIPO.bat\n"
        "   (O bien: cd server && node server.js)\n"
        "2. Abrir en cualquier navegador: http://localhost:3000\n"
        "3. El mapa iniciará automáticamente en vista de Calles y Sentidos Viales centrada en el Nuevo Hospital de Apoyo Huarmey (II-1)."
    )
    r_cmd.font.name = "Consolas"
    r_cmd.font.size = Pt(9)
    r_cmd.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)

    # -------------------------------------------------------------
    # SECCIÓN 10: CONCLUSIÓN Y PRÓXIMOS PASOS (SLIDES DE LA PRESENTACIÓN)
    # -------------------------------------------------------------
    h10 = doc.add_paragraph()
    h10.paragraph_format.space_before = Pt(14)
    h10.paragraph_format.space_after = Pt(6)
    rh10 = h10.add_run("10. SÍNTESIS PARA LA PRESENTACIÓN EJECUTIVA")
    rh10.bold = True
    rh10.font.name = "Calibri"
    rh10.font.size = Pt(14)
    rh10.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)

    p_end = doc.add_paragraph()
    p_end.paragraph_format.line_spacing = 1.15
    p_end.paragraph_format.space_after = Pt(6)
    p_end.add_run(
        "Este documento técnico plasma en su totalidad los conceptos expuestos en el audio del prototipo "
        "y se articula directamente con los activos de software y documentación ya generados en el proyecto. "
        "Una vez revisado y validado este texto por la dirección del proyecto, servirá de base textual y conceptual "
        "para la generación del deck de diapositivas en PowerPoint (.pptx), estructurando la narrativa en diapositivas visuales, "
        "tarjetas ejecutivas y notas del orador sincronizadas al segundo con la grabación de audio."
    )

    # Guardar documento
    output_path = r"C:\Users\PC-EDWARD\OneDrive\MAXIME\Cronicos_Huarmey\Prototipo_Aplicación\Documento_Tecnico_Prototipo_Cronicos_Huarmey.docx"
    doc.save(output_path)
    print(f"Documento guardado exitosamente en: {output_path}")

    # Copia de respaldo en docs
    backup_path = r"C:\Users\PC-EDWARD\OneDrive\MAXIME\Cronicos_Huarmey\Prototipo_Aplicación\docs\Documento_Tecnico_Prototipo_Cronicos_Huarmey.docx"
    doc.save(backup_path)
    print(f"Copia de respaldo guardada en: {backup_path}")

if __name__ == "__main__":
    create_document()
