// Cada nodo es una "pestaña" de la interfaz. El contenido es HTML simple.
// TODO(Ale): reemplazar los textos de ejemplo por los reales.
export interface NodeSection {
  id: string;
  label: string;
  code: string; // etiqueta corta estilo HUD
  html: string;
}

export const nodes: NodeSection[] = [
  {
    id: "sobre-mi",
    label: "Sobre mí",
    code: "ID-01",
    html: `
      <p>Soy <strong>Alejandro Florido</strong>, estudiante de Programación en la UTN (Resistencia, Chaco).</p>
      <p>Me interesa entender cómo funcionan las cosas por dentro: backend, bases de datos y, cada vez más, la web.</p>
    `,
  },
  {
    id: "proyectos",
    label: "Proyectos",
    code: "PRJ-02",
    html: `
      <ul class="panel__list">
        <li><span>Un POV diferente</span><a href="https://github.com/AlejandroFlorido/unpovdiferente" target="_blank" rel="noopener">repo ↗</a></li>
        <li><span>Proyecto final UTN</span><a href="https://github.com/AlejandroFlorido/proyectoFinalUTN" target="_blank" rel="noopener">repo ↗</a></li>
        <li><span>Alquiler de canchas</span><a href="https://github.com/AlejandroFlorido/alquilerDeCanchas" target="_blank" rel="noopener">repo ↗</a></li>
      </ul>
    `,
  },
  {
    id: "habilidades",
    label: "Habilidades",
    code: "SKL-03",
    html: `
      <div class="panel__tags">
        <span>HTML</span><span>CSS</span><span>JavaScript</span><span>Java</span>
        <span>Python</span><span>SQL</span><span>Git</span>
      </div>
    `,
  },
  {
    id: "contacto",
    label: "Contacto",
    code: "COM-04",
    html: `
      <ul class="panel__list">
        <li><span>Email</span><a href="mailto:floridosalejandro@gmail.com">floridosalejandro@gmail.com</a></li>
        <li><span>GitHub</span><a href="https://github.com/AlejandroFlorido" target="_blank" rel="noopener">AlejandroFlorido ↗</a></li>
        <li><span>LinkedIn</span><a href="https://www.linkedin.com/in/alejandro-florido-453950283/" target="_blank" rel="noopener">perfil ↗</a></li>
      </ul>
    `,
  },
  {
    id: "cv",
    label: "CV",
    code: "DOC-05",
    html: `
      <p>Elegí el formato de mi currículum:</p>
      <ul class="panel__list">
        <li><span>CV con diseño · con foto, para leer o imprimir</span><a href="cv-alejandro-florido.pdf" target="_blank" rel="noopener">abrir ↗</a></li>
        <li><span>CV para ATS · texto simple, para postulaciones online</span><a href="cv-alejandro-florido-ats.pdf" target="_blank" rel="noopener">abrir ↗</a></li>
      </ul>
    `,
  },
];
