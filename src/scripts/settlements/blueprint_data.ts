// Format of generated blueprints (assets-src/structures/bfstruct.py, to_data). Pure types, no game imports.

export interface PaletteEntry {
  id: string;
  states?: Record<string, string | number | boolean>;
  /** A sign to write the building's name on (imported designs: the sign that says "[HOUSE NAME]"). */
  sign?: boolean;
}

export interface BlueprintData {
  /** [width (x), height (y), depth (z)]. */
  size: [number, number, number];
  palette: PaletteEntry[];
  /** layers[y][z] is a row string, one character per x: '.' = air, otherwise a palette index (ALPHABET). */
  layers: string[][];
}

export const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&()*+-/:;<=>?@[]^_{|}~";
