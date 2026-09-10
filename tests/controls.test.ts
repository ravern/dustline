import test from 'node:test';
import assert from 'node:assert/strict';
import { actionForCode, bindingError, defaultBindings, held, readBindings } from '../src/controls.ts';

test('personal bindings persist, reject conflicts, and drive keyboard and mouse actions', () => {
  const bindings = defaultBindings(), otherPlayer = defaultBindings();
  assert.equal(bindingError(bindings, 'forward', 'KeyI'), '');
  bindings.forward = ['KeyI'];
  assert.equal(bindingError(bindings, 'jump', 'Mouse3'), '');
  bindings.jump = ['Mouse3'];
  const restored = readBindings(JSON.parse(JSON.stringify(bindings)));
  assert.equal(actionForCode(restored, 'KeyW'), undefined);
  assert.equal(actionForCode(restored, 'KeyI'), 'forward');
  assert.equal(actionForCode(restored, 'Mouse3'), 'jump');
  assert.equal(actionForCode(otherPlayer, 'KeyW'), 'forward');
  assert.ok(held(restored, new Set(['ShiftRight']), 'sprint'));
  assert.ok(held(restored, new Set(['ControlRight']), 'crouch'));
  assert.ok(bindingError(restored, 'fire', 'KeyI'));
  assert.ok(bindingError(restored, 'fire', 'Escape'));
  assert.ok(bindingError(restored, 'fire', 'MetaLeft'));
  for (const corrupt of [null, [], 42, {forward:['KeyI']}, {...bindings,fire:['KeyI']}, {...bindings,fire:['unknown']}, {...bindings,fire:[]}]) {
    assert.deepEqual(readBindings(corrupt), defaultBindings());
  }
});
