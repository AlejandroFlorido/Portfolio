# Portafolio de Alejandro Florido

Mi portafolio personal como desarrollador web, hecho con [Astro](https://astro.build).

🔗 **Sitio:** https://alejandroflorido.github.io/Portfolio/

## Requisitos

- Node.js 22 (ver `.nvmrc`)
- npm

## Comandos

| Comando           | Qué hace                                              |
| ----------------- | ----------------------------------------------------- |
| `npm install`     | Instala las dependencias                              |
| `npm run dev`     | Servidor local en `http://localhost:4321/Portfolio/`  |
| `npm run build`   | Revisa tipos (`astro check`) y genera el sitio en `dist/` |
| `npm run preview` | Sirve localmente el sitio ya generado                 |

## Estructura

```
├── public/                 # Archivos estáticos (foto, CV, favicon)
├── src/
│   ├── components/         # Secciones de la página (Header, Hero, About, Projects, Contact, Footer)
│   ├── data/
│   │   ├── site.ts         # Datos personales, textos, redes y tecnologías
│   │   └── projects.ts     # Lista de proyectos
│   ├── layouts/Layout.astro
│   ├── pages/index.astro   # Página principal
│   └── styles/global.css   # Colores, tipografía y estilos base (modo claro y oscuro)
└── .github/workflows/      # CI en cada PR y deploy automático a GitHub Pages
```

## Cómo editar contenido

- **Textos y enlaces:** `src/data/site.ts`
- **Agregar un proyecto:** sumá un objeto en `src/data/projects.ts` (las imágenes van en `public/images/`)
- **Colores:** variables en `:root` de `src/styles/global.css`

## Flujo de trabajo

1. Crear una rama por cambio: `git checkout -b feature/nombre`
2. Commit y push, luego abrir un Pull Request contra `main`
3. El workflow **CI** compila el sitio en el PR
4. Al hacer merge en `main`, **Deploy a GitHub Pages** publica el sitio

> Primera vez: en GitHub, **Settings → Pages → Build and deployment → Source** tiene que estar en **GitHub Actions**.
