/**
 * Escapa los comodines de LIKE/ILIKE de Postgres (%, _ y la barra invertida)
 * para que un texto ingresado por el usuario se compare literalmente.
 * Con el patrón escapado, `ilike` equivale a una comparación exacta
 * insensible a mayúsculas.
 */
export function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}
