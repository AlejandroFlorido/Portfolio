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
├── public/                 # Archivos estáticos (imágenes, CV, favicon)
├── src/
│   ├── layouts/Layout.astro  # HTML base compartido por todas las páginas
│   └── pages/index.astro     # Página principal
└── .github/workflows/      # CI en cada PR y deploy automático a GitHub Pages
```

Cada archivo en `src/pages/` se convierte en una página del sitio.

## Flujo de trabajo

1. Crear una rama por cambio: `git checkout -b feature/nombre`
2. Commit y push, luego abrir un Pull Request contra `main`
3. El workflow **CI** compila el sitio en el PR
4. Al hacer merge en `main`, **Deploy a GitHub Pages** publica el sitio

> Primera vez: en GitHub, **Settings → Pages → Build and deployment → Source** tiene que estar en **GitHub Actions**.
