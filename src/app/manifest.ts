import type { MetadataRoute } from "next";

// Sin este manifest, iOS y Android abren el acceso directo con la barra del navegador.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mycotuc Gestión",
    short_name: "Mycotuc",
    description: "Ventas, stock y producción de Mycotuc.",
    lang: "es-AR",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f1f2ee",
    theme_color: "#f1f2ee",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
