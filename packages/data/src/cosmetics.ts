/**
 * Cosmetics (GAME_DESIGN §18).
 *
 * **Palettes only for 1.0's first pass.** §18 also lists emote stickers and
 * victory poses; both need art and animation that does not exist yet, and
 * shipping them as coloured squares and a re-used idle would fail the quality
 * bar rather than meet the spec. Palettes are the one cosmetic that is fully
 * deliverable today: they are a recolour of the champion's own materials, they
 * preview live in the 3D viewer, and they read instantly on the field.
 *
 * Each is a **multiply tint** over the model's existing texture, so the pack's
 * detail survives and the silhouette never changes — a recoloured Rook is still
 * unmistakably Rook at a glance, which matters more in a MOBA than novelty.
 * That also means a palette can only ever darken or warm; there are no white
 * palettes here because there cannot be, and pretending otherwise would ship a
 * muddy one.
 */

export interface PaletteDef {
  id: string;
  championId: string;
  name: string;
  /** Multiplied into every material colour. */
  tint: number;
  /** Swatch shown in the shop and the viewer's switcher. */
  swatch: string;
}

/** Two per champion, plus the free default that every account already has. */
export const PALETTES: PaletteDef[] = [
  { id: 'rook_iron', championId: 'rook', name: 'Iron Watch', tint: 0x8fa4c4, swatch: '#8fa4c4' },
  { id: 'rook_ember', championId: 'rook', name: 'Ember Guard', tint: 0xd98a5a, swatch: '#d98a5a' },
  { id: 'fathom_abyss', championId: 'fathom', name: 'Abyssal', tint: 0x5f7fd4, swatch: '#5f7fd4' },
  {
    id: 'fathom_reef',
    championId: 'fathom',
    name: 'Coral Reef',
    tint: 0xd97f8a,
    swatch: '#d97f8a',
  },
  { id: 'mortis_bone', championId: 'mortis', name: 'Bonelight', tint: 0xd6cfae, swatch: '#d6cfae' },
  { id: 'mortis_void', championId: 'mortis', name: 'Voidbound', tint: 0x8f6fd4, swatch: '#8f6fd4' },
  {
    id: 'sylva_bloom',
    championId: 'sylva',
    name: 'Spring Bloom',
    tint: 0x9ed47f,
    swatch: '#9ed47f',
  },
  {
    id: 'sylva_autumn',
    championId: 'sylva',
    name: 'Late Autumn',
    tint: 0xd4a05f,
    swatch: '#d4a05f',
  },
  {
    id: 'rattle_venom',
    championId: 'rattle',
    name: 'Venomweave',
    tint: 0x8fd48f,
    swatch: '#8fd48f',
  },
  { id: 'rattle_ash', championId: 'rattle', name: 'Ashen', tint: 0x9a9aa8, swatch: '#9a9aa8' },
  {
    id: 'grukk_warpaint',
    championId: 'grukk',
    name: 'War Paint',
    tint: 0xd45f5f,
    swatch: '#d45f5f',
  },
  { id: 'grukk_swamp', championId: 'grukk', name: 'Swamp King', tint: 0x7f9e5f, swatch: '#7f9e5f' },
  {
    id: 'boltz_solar',
    championId: 'boltz',
    name: 'Solar Flare',
    tint: 0xd4b45f,
    swatch: '#d4b45f',
  },
  { id: 'boltz_deep', championId: 'boltz', name: 'Deep Space', tint: 0x6f7fb4, swatch: '#6f7fb4' },
  { id: 'wisp_hollow', championId: 'wisp', name: 'Hollow', tint: 0xa8b4d4, swatch: '#a8b4d4' },
  { id: 'wisp_candle', championId: 'wisp', name: 'Candleflame', tint: 0xd4b48f, swatch: '#d4b48f' },
  { id: 'piper_tidal', championId: 'piper', name: 'Tidal', tint: 0x5fb4c4, swatch: '#5fb4c4' },
  { id: 'piper_dusk', championId: 'piper', name: 'Dusk Hunter', tint: 0xa87f9e, swatch: '#a87f9e' },
  { id: 'vex_crimson', championId: 'vex', name: 'Crimson Hour', tint: 0xc45f6f, swatch: '#c45f6f' },
  { id: 'vex_frost', championId: 'vex', name: 'Frostbitten', tint: 0x7fb4d4, swatch: '#7fb4d4' },
];

export const PALETTE_BY_ID: Record<string, PaletteDef> = Object.fromEntries(
  PALETTES.map((p) => [p.id, p]),
);

export function palettesFor(championId: string): PaletteDef[] {
  return PALETTES.filter((p) => p.championId === championId);
}
