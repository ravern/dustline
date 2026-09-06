import type { Loadout, Slot, WeaponId } from './types.ts';
export interface Weapon { id: WeaponId; name: string; shortName: string; category: string; damage: number; headMultiplier: number; mag: number; reserve: number; fireInterval: number; reloadTime: number; adsTime: number; automatic: boolean; range: number; hipSpread: number; adsSpread: number; recoil: number }
export const WEAPONS: Record<WeaponId, Weapon> = {
  intervention: { id: 'intervention', name: 'Intervention', shortName: 'INTERVENTION', category: 'Bolt-action sniper', damage: 100, headMultiplier: 1.5, mag: 5, reserve: 25, fireInterval: .95, reloadTime: 2.25, adsTime: .16, automatic: false, range: 150, hipSpread: .09, adsSpread: .0004, recoil: .045 },
  ak47: { id: 'ak47', name: 'AK-47', shortName: 'AK-47', category: 'Assault rifle', damage: 34, headMultiplier: 1.6, mag: 30, reserve: 120, fireInterval: .105, reloadTime: 1.9, adsTime: .18, automatic: true, range: 100, hipSpread: .035, adsSpread: .003, recoil: .013 },
  scar: { id: 'scar', name: 'SCAR-H', shortName: 'SCAR-H', category: 'Heavy assault rifle', damage: 42, headMultiplier: 1.5, mag: 20, reserve: 100, fireInterval: .135, reloadTime: 2.05, adsTime: .20, automatic: true, range: 100, hipSpread: .03, adsSpread: .002, recoil: .017 },
  m9: { id: 'm9', name: 'M9', shortName: 'M9', category: 'Sidearm', damage: 30, headMultiplier: 1.7, mag: 15, reserve: 60, fireInterval: .18, reloadTime: 1.35, adsTime: .10, automatic: false, range: 65, hipSpread: .04, adsSpread: .004, recoil: .016 },
  knife: { id: 'knife', name: 'Combat knife', shortName: 'KNIFE', category: 'Melee', damage: 100, headMultiplier: 1, mag: 1, reserve: 0, fireInterval: .55, reloadTime: 0, adsTime: 0, automatic: false, range: 2.35, hipSpread: 0, adsSpread: 0, recoil: 0 }
};
export const weaponForSlot = (loadout: Loadout, slot: Slot): WeaponId => slot === 0 ? loadout.primary : slot === 1 ? 'm9' : 'knife';
