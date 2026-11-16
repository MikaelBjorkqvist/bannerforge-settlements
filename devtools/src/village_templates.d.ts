// Types for the generated module dist-devtools/.../scripts/village_templates.js (written by tools/build_devtools.mjs
// from the owner's local vanilla install; vanilla-derived data is never committed).

export type StateValue = string | number | boolean;
/** Alternatives for one block, best first: the first that BlockPermutation.resolve() accepts wins. */
export type Candidates = { name: string; states: Record<string, StateValue> }[];

export interface Template {
  /** e.g. "plains/houses/plains_small_house_1" */
  key: string;
  /** Sign text, lines joined with \n. */
  label: string;
  biome: string;
  size: [number, number, number];
  /** Template y = 0 sits at surface + dy. */
  dy: number;
  /** Offset of the template's (0,0,0) corner from the layout origin. */
  ox: number;
  oz: number;
  /** Indexes into CANDIDATES. */
  palette: number[];
  /** Flat list: x, y, z, palette index, x, y, z, … */
  blocks: number[];
}

export interface RowLabel {
  biome: string;
  ox: number;
  oz: number;
}

export const CANDIDATES: Candidates[];
export const TEMPLATES: Template[];
export const ROWS: RowLabel[];
/** Layout footprint (x, z) from the origin, for the ticking-area check. */
export const EXTENT: [number, number];
