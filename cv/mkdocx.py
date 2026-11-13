import sys
from docx import Document
from docx.shared import Pt, Mm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

ACC = RGBColor(0x0f,0x6f,0x86)
d = Document()
sec = d.sections[0]
sec.page_width, sec.page_height = Mm(210), Mm(297)
sec.left_margin = sec.right_margin = Mm(15); sec.top_margin = Mm(11); sec.bottom_margin = Mm(10)
st = d.styles['Normal']; st.font.name = 'Arial'; st.font.size = Pt(9.5)
st.element.rPr.rFonts.set(qn('w:eastAsia'), 'Arial')
st.paragraph_format.space_after = Pt(0); st.paragraph_format.line_spacing = 1.08
lb = d.styles['List Bullet']; lb.font.name='Arial'; lb.font.size=Pt(9.5)
lb.paragraph_format.space_after = Pt(1.5)

def para(text='', bold=False, size=None, color=None, after=0, before=0):
    p = d.add_paragraph()
    if text:
        r = p.add_run(text); r.bold = bold
        if size: r.font.size = Pt(size)
        if color: r.font.color.rgb = color
    p.paragraph_format.space_after = Pt(after); p.paragraph_format.space_before = Pt(before)
    return p

def bottom_border(p):
    pPr = p._p.get_or_add_pPr(); b = OxmlElement('w:pBdr'); e = OxmlElement('w:bottom')
    for k,v in (('w:val','single'),('w:sz','6'),('w:space','1'),('w:color','0F6F86')): e.set(qn(k),v)
    b.append(e); pPr.append(b)

def heading(t):
    p = para(t.upper(), bold=True, size=11, color=ACC, before=7, after=3); bottom_border(p)

def bullet(t):
    p = d.add_paragraph(t, style='List Bullet')

def entry(title, meta):
    para(title, bold=True, size=10, before=2)
    para(meta, after=1.5)

para('Alejandro Gabriel Florido', bold=True, size=20)
para('Desarrollador Web Frontend y de Aplicaciones de Escritorio en Python', bold=True, size=11.5, color=ACC, after=2)
para('Resistencia, Chaco, Argentina · +54 362 474-5978 · floridosalejandro@gmail.com', size=9)
para('LinkedIn: linkedin.com/in/alejandro-florido-453950283', size=9)
para('GitHub: github.com/AlejandroFlorido · Portfolio: alejandroflorido.github.io/Portfolio', size=9)

heading('Resumen profesional')
para('Desarrollador web frontend y de aplicaciones de escritorio en Python, estudiante avanzado de la Tecnicatura Universitaria en Programación (UTN, 85% aprobado). Experiencia en automatización de procesos administrativos, auditoría, gestión de compras y soporte de sistemas y redes. Desarrollo con JavaScript, TypeScript, CSS, Astro y Python, integrando inteligencia artificial en el flujo de trabajo.')

heading('Experiencia laboral')
entry('Auditor General, Encargado de Compras y Asistente de Sistemas y Redes', 'Grupo Ginesta, Resistencia, Chaco. Junio 2024 – Actualidad')
bullet('Desarrollé una aplicación de escritorio en Python que automatiza el control de horas del personal, reduciendo la tarea de 24 horas a un máximo de 2 horas semanales (−90%).')
bullet('Gestiono las compras con más de 30 proveedores de distintos rubros (carnes, granel, bebidas, lácteos, fiambrería y limpieza): cotizaciones, comparación de precios, órdenes de compra y control de stock.')
bullet('Realizo la auditoría general de la operación: control de registros, asistencia y horas del personal, detección de inconsistencias e informes para la dirección.')
bullet('Brindo soporte técnico de sistemas y redes: mantenimiento de equipos, conectividad y asistencia a usuarios.')
bullet('Automatizo reportes en Excel con Python (pandas, openpyxl) para agilizar la toma de decisiones.')
entry('Trader de Activos Digitales (Independiente)', 'Axie Infinity, remoto. Diciembre 2021 – Noviembre 2022')
bullet('Compré y vendí activos digitales (NFT) en una plataforma blockchain, con análisis de mercado y seguimiento de precios.')

heading('Proyectos')
entry('Procesador de fichadas de asistencia (aplicación de escritorio)', 'Tecnologías: Python, Tkinter, pandas, openpyxl')
bullet('Desarrollé un algoritmo de programación dinámica que empareja entradas y salidas del reloj de asistencia y detecta marcas faltantes, repetidas y turnos anómalos.')
bullet('Generé reportes en Excel con alertas por colores y resumen de horas por empleado, usados semanalmente en Grupo Ginesta.')
entry('Portfolio web interactivo', 'Tecnologías: Astro, TypeScript, JavaScript, CSS, Three.js, GitHub Actions')
bullet('Diseñé y desarrollé un sitio personal con escena 3D, animaciones y sonido generado por código, desplegado automáticamente con GitHub Actions y GitHub Pages.')

heading('Educación')
entry('Tecnicatura Universitaria en Programación', 'Universidad Tecnológica Nacional, Facultad Regional Resistencia. 2025 – 2027. 85% de la carrera aprobada.')
entry('Ingeniería en Sistemas de Información', 'Universidad Tecnológica Nacional, Facultad Regional Resistencia. 2018 – 2024. Cursado hasta 4.º año (60% aprobado).')
entry('Curso de Desarrollo Web y Bases de Datos', '2021. Python, Django, Bootstrap, MySQL y SQL Server.')

heading('Habilidades')
for k,v in [('Desarrollo web','JavaScript, TypeScript, HTML5, CSS3, Astro, Bootstrap, diseño responsive'),
            ('Python y escritorio','Python, Tkinter, pandas, openpyxl, automatización de Excel y CSV'),
            ('Inteligencia artificial','desarrollo asistido por IA, Claude Code, ChatGPT, prompt engineering'),
            ('Backend y bases de datos','Django, Java, SQL, MySQL, SQL Server'),
            ('Herramientas','Git, GitHub, GitHub Actions, VS Code, Microsoft Excel'),
            ('Gestión','auditoría interna, compras y proveedores, control de stock, soporte técnico y redes')]:
    p = para(after=1); r = p.add_run(k + ': '); r.bold = True; p.add_run(v + '.')

heading('Idiomas')
para('Español: nativo. Inglés: intermedio (lectura, escritura y conversación).')
d.core_properties.title = 'CV Alejandro Gabriel Florido'
d.core_properties.author = 'Alejandro Gabriel Florido'
d.save(sys.argv[1])
