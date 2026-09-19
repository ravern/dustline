import type { Loadout, PrimaryId, SecondaryId } from '../shared/types';

export const LOADOUT_COUNT = 5;
export interface LoadoutPreset { name: string; weapons: Loadout }
export const PRIMARY_WEAPONS: PrimaryId[] = ['intervention', 'ak47', 'scar'];
export const SECONDARY_WEAPONS: SecondaryId[] = ['m9', 'deagle', 'glock'];
export const sameLoadout = (a: Loadout, b: Loadout) => a.primary === b.primary && a.secondary === b.secondary;

/** Keep the old primary selection when upgrading an existing browser. */
export function readLoadouts(saved: Record<string, unknown>): { presets: LoadoutPreset[]; active: number } {
  const stored = Array.isArray(saved.loadouts) ? saved.loadouts : [];
  const presets = Array.from({ length: LOADOUT_COUNT }, (_, index) => {
    const entry = stored[index];
    const value = entry && typeof entry === 'object' ? entry : {};
    const weapons = value.weapons && typeof value.weapons === 'object' ? value.weapons : index === 0 ? saved : {};
    return {
      name: typeof value.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 24) : `Loadout ${index + 1}`,
      weapons: {
        primary: PRIMARY_WEAPONS.includes(weapons.primary) ? weapons.primary : PRIMARY_WEAPONS[index % PRIMARY_WEAPONS.length],
        secondary: SECONDARY_WEAPONS.includes(weapons.secondary) ? weapons.secondary : 'm9',
      } as Loadout,
    };
  });
  const active = Number.isInteger(saved.activeLoadout) && Number(saved.activeLoadout) >= 0 && Number(saved.activeLoadout) < LOADOUT_COUNT ? Number(saved.activeLoadout) : 0;
  return { presets, active };
}
