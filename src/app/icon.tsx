import { renderAppIcon } from "@/lib/app-icon";

export const contentType = "image/png";

// Se publican en /icon/192 y /icon/512, que son las rutas que usa el manifest.
export function generateImageMetadata() {
  return [192, 512].map((size) => ({
    id: String(size),
    size: { width: size, height: size },
    contentType,
  }));
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  return renderAppIcon(Number(await id));
}
