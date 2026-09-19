import test from 'node:test';
import assert from 'node:assert/strict';
import { readLoadouts, sameLoadout } from '../src/loadouts.ts';

test('presets migrate the old loadout and independently preserve primary and secondary selections', () => {
  const migrated = readLoadouts({ primary: 'scar' });
  assert.equal(migrated.presets.length, 5);
  assert.deepEqual(migrated.presets[0].weapons, { primary: 'scar', secondary: 'm9' });
  migrated.presets[2] = { name: 'Close quarters', weapons: { primary: 'ak47', secondary: 'glock' } };
  const restored = readLoadouts(JSON.parse(JSON.stringify({ loadouts: migrated.presets, activeLoadout: 2 })));
  assert.equal(restored.active, 2);
  assert.deepEqual(restored.presets, migrated.presets);
  assert.equal(sameLoadout(restored.presets[0].weapons, restored.presets[2].weapons), false);
});

test('corrupt stored presets cannot supply unknown weapons or an invalid selected slot', () => {
  const restored = readLoadouts({ activeLoadout: 99, loadouts: [{ name: '<tag>', weapons: { primary: 'knife', secondary: 'scar' } }, null, 4] });
  assert.equal(restored.active, 0);
  assert.equal(restored.presets[0].name, '<tag>'); // UI inserts names with textContent, never as markup.
  assert.deepEqual(restored.presets[0].weapons, { primary: 'intervention', secondary: 'm9' });
  assert.equal(restored.presets.length, 5);
});
