import { ImageResponse } from "next/og";

/**
 * Ícono de la app instalada: un hongo (sombrero ámbar, pie claro) sobre tinta.
 * El dibujo queda dentro de la zona segura de los íconos "maskable" (80 % central),
 * así Android puede recortarlo en círculo sin cortar el sombrero.
 */
export function renderAppIcon(size: number) {
  const unit = size / 100;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#1e1915",
        }}
      >
        <div
          style={{
            width: 56 * unit,
            height: 28 * unit,
            background: "#e0901f",
            borderTopLeftRadius: 28 * unit,
            borderTopRightRadius: 28 * unit,
            borderBottomLeftRadius: 3 * unit,
            borderBottomRightRadius: 3 * unit,
          }}
        />
        <div
          style={{
            width: 18 * unit,
            height: 22 * unit,
            background: "#f1f2ee",
            borderBottomLeftRadius: 6 * unit,
            borderBottomRightRadius: 6 * unit,
          }}
        />
      </div>
    ),
    { width: size, height: size },
  );
}
