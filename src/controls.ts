export const CONTROLS = {
  forward: { label: 'Move forward', codes: ['KeyW'] },
  backward: { label: 'Move backward', codes: ['KeyS'] },
  left: { label: 'Move left', codes: ['KeyA'] },
  right: { label: 'Move right', codes: ['KeyD'] },
  sprint: { label: 'Sprint', codes: ['ShiftLeft'] },
  jump: { label: 'Jump', codes: ['Space'] },
  crouch: { label: 'Crouch / slide', codes: ['KeyC', 'ControlLeft'] },
  fire: { label: 'Fire / knife', codes: ['Mouse0'] },
  aim: { label: 'Aim', codes: ['Mouse2'] },
  reload: { label: 'Reload', codes: ['KeyR'] },
  primary: { label: 'Primary weapon', codes: ['Digit1'] },
  secondary: { label: 'Pistol', codes: ['Digit2'] },
  knife: { label: 'Knife', codes: ['Digit3'] },
  melee: { label: 'Quick melee', codes: ['KeyV'] },
  swap: { label: 'Swap weapon', codes: ['KeyQ'] },
  scoreboard: { label: 'Scoreboard', codes: ['Tab'] },
  pause: { label: 'Release mouse / menu', codes: ['Escape'] },
};
export type Action = keyof typeof CONTROLS;
export type Bindings = Record<Action, string[]>;
export const ACTIONS = Object.keys(CONTROLS) as Action[];
export const defaultBindings = (): Bindings => Object.fromEntries(ACTIONS.map(action => [action, [...CONTROLS[action].codes]])) as Bindings;
export const normalizeCode = (code: string) => ({ ShiftRight: 'ShiftLeft', ControlRight: 'ControlLeft', AltRight: 'AltLeft' }[code] ?? code);
const validCodes = new Set([
  ...Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ', letter => `Key${letter}`),
  ...Array.from('0123456789', digit => `Digit${digit}`),
  ...Array.from('0123456789', digit => `Numpad${digit}`),
  'Space', 'Tab', 'Escape', 'Enter', 'Backspace', 'Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ControlLeft', 'AltLeft',
  'Backquote', 'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash', 'Semicolon', 'Quote', 'Comma', 'Period', 'Slash',
  'NumpadAdd', 'NumpadSubtract', 'NumpadMultiply', 'NumpadDivide', 'NumpadDecimal', 'NumpadEnter',
  'Mouse0', 'Mouse1', 'Mouse2', 'Mouse3', 'Mouse4',
]);
export function bindingError(bindings: Bindings, action: Action, code: string): string {
  switch (true) {
    case !validCodes.has(code): return 'This key is reserved by the browser or is not supported.';
    case code === 'Escape' && action !== 'pause': return 'Escape must remain available to release the mouse.';
    default: {
      const conflict = ACTIONS.find(other => other !== action && bindings[other].includes(code));
      return conflict ? `${CONTROLS[conflict].label} already uses this control. Change that binding first.` : '';
    }
  }
}
export function readBindings(value: unknown): Bindings {
  const defaults = defaultBindings();
  switch (true) {
    case !value || typeof value !== 'object' || Array.isArray(value): return defaults;
    default: {
      const stored = value as Record<string, unknown>;
      const valid = ACTIONS.every(action => Array.isArray(stored[action]) && stored[action].length > 0 && stored[action].length <= 2 && stored[action].every((code: unknown) => typeof code === 'string' && validCodes.has(code) && (code !== 'Escape' || action === 'pause')));
      switch (valid) {
        case false: return defaults;
        default: {
          const codes = ACTIONS.flatMap(action => stored[action] as string[]);
          return new Set(codes).size === codes.length ? Object.fromEntries(ACTIONS.map(action => [action, [...stored[action] as string[]]])) as Bindings : defaults;
        }
      }
    }
  }
}
export const actionForCode = (bindings: Bindings, code: string) => ACTIONS.find(action => bindings[action].includes(normalizeCode(code)));
export const held = (bindings: Bindings, keys: Set<string>, action: Action) => [...keys].some(code => bindings[action].includes(normalizeCode(code)));
export function controlLabel(code: string): string {
  const names: Record<string, string> = { Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5', ShiftLeft: 'Shift', ControlLeft: 'Ctrl', AltLeft: 'Alt', Escape: 'Esc' };
  return names[code] ?? code.replace('Key', '').replace('Digit', '').replace('Arrow', '');
}
