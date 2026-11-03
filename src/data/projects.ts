// Proyectos que aparecen en la sección "Proyectos".
// Para sumar uno nuevo, agregá un objeto a la lista. Los campos con "?" son opcionales.
export interface Project {
  title: string;
  description: string;
  tags: string[];
  repo?: string; // enlace al repositorio
  demo?: string; // enlace a la versión publicada
  image?: string; // ruta dentro de /public, por ejemplo "images/proyectos/mi-app.png"
}

// TODO(Ale): completar descripciones y tecnologías reales de cada proyecto.
export const projects: Project[] = [
  {
    title: "Un POV diferente",
    description: "Descripción pendiente.",
    tags: [],
    repo: "https://github.com/AlejandroFlorido/unpovdiferente",
  },
  {
    title: "Proyecto final UTN",
    description: "Descripción pendiente.",
    tags: [],
    repo: "https://github.com/AlejandroFlorido/proyectoFinalUTN",
  },
  {
    title: "Alquiler de canchas",
    description: "Descripción pendiente.",
    tags: [],
    repo: "https://github.com/AlejandroFlorido/alquilerDeCanchas",
  },
];
