export type CoordinatePolicy = "hidden" | "region" | "exact_admin_only";

export const COORDINATE_POLICIES: readonly CoordinatePolicy[] = [
  "hidden",
  "region",
  "exact_admin_only",
];

export function isCoordinatePolicy(value: string): value is CoordinatePolicy {
  return (COORDINATE_POLICIES as readonly string[]).includes(value);
}

export interface Coordinates {
  x?: number;
  y?: number;
  z?: number;
}

export interface CoordinateRegion {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
}

export function roundToRegion(x: number, z: number, gridSize: number): CoordinateRegion {
  if (!Number.isFinite(x) || !Number.isFinite(z) || gridSize <= 0) {
    throw new Error("Coordenadas ou tamanho de grade inválidos para arredondamento de região.");
  }
  const xMin = Math.floor(x / gridSize) * gridSize;
  const zMin = Math.floor(z / gridSize) * gridSize;
  return {
    xMin,
    xMax: xMin + gridSize - 1,
    zMin,
    zMax: zMin + gridSize - 1,
  };
}

export function formatRegionPt(region: CoordinateRegion): string {
  return `X ${region.xMin}–${region.xMax}, Z ${region.zMin}–${region.zMax}`;
}

export function stripCoordinates<T extends { coordinates?: Coordinates }>(event: T): T {
  const { coordinates: _coordinates, ...rest } = event;
  return rest as T;
}

export function describeRegionPolicyPt(policy: CoordinatePolicy): string {
  switch (policy) {
    case "hidden":
      return "As coordenadas exatas dos Pokémon ficam ocultas para preservar a aventura.";
    case "region":
      return "Mostramos apenas a região aproximada onde o Pokémon foi visto.";
    case "exact_admin_only":
      return "Coordenadas exatas são compartilhadas apenas com a equipe administrativa.";
  }
}
