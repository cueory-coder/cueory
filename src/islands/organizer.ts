export interface OrganizerSet {
  id: string;
  title: string;
  groups: { id: string; name: string }[];
  items: { id: string; text: string; group: string }[];
}
export type Place = string;
export interface OrganizerState {
  order: string[];
  groupIds: string[];
  positions: Record<string, Place>;
  locked: string[];
  tries: number;
  last: { right: number; returned: string[] } | null;
}

function record(data: unknown): data is Record<string, unknown> {
  return typeof data === 'object' && data !== null && !Array.isArray(data);
}
function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && !!value.trim() && value.length <= max;
}

export function parseSet(data: unknown): OrganizerSet {
  if (!record(data)) throw new Error('the organizer set must be an object.');
  if (!text(data.id, 128)) throw new Error('the set needs a short id.');
  if (!text(data.title, 200)) throw new Error('the set needs a title.');
  if (!Array.isArray(data.groups) || data.groups.length < 2 || data.groups.length > 4) throw new Error('the set must have 2 to 4 groups.');
  if (!Array.isArray(data.items) || data.items.length < 4 || data.items.length > 12) throw new Error('the set must have 4 to 12 items.');
  const groupIds = new Set<string>();
  const groups: OrganizerSet['groups'] = [];
  for (const group of data.groups) {
    if (!record(group) || !text(group.id, 128)) throw new Error('each group needs a short id.');
    if (group.id === 'tray') throw new Error('tray is reserved for unsorted items, not a group id.');
    if (groupIds.has(group.id)) throw new Error('a group id is repeated.');
    if (!text(group.name, 200)) throw new Error('each group needs a name.');
    groupIds.add(group.id);
    groups.push({ id: group.id, name: group.name });
  }
  const itemIds = new Set<string>();
  const items: OrganizerSet['items'] = [];
  for (const item of data.items) {
    if (!record(item) || !text(item.id, 128)) throw new Error('each item needs a short id.');
    if (itemIds.has(item.id)) throw new Error('an item id is repeated.');
    if (!text(item.text, 1000)) throw new Error('each item needs some text.');
    if (typeof item.group !== 'string' || !groupIds.has(item.group)) throw new Error('an item names a group that does not exist.');
    itemIds.add(item.id);
    items.push({ id: item.id, text: item.text, group: item.group });
  }
  return { id: data.id, title: data.title, groups, items };
}

export function startOrganizer(set: OrganizerSet, seed: number): OrganizerState {
  const parsed = parseSet(set);
  const order = parsed.items.map((item) => item.id);
  let random = seed >>> 0;
  for (let i = order.length - 1; i > 0; i--) {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    const j = random % (i + 1);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return {
    order, groupIds: parsed.groups.map((group) => group.id),
    positions: Object.fromEntries(order.map((id) => [id, 'tray'])), locked: [], tries: 0, last: null,
  };
}

export function placeItem(state: OrganizerState, itemId: string, groupId: Place): OrganizerState {
  if (!Object.hasOwn(state.positions, itemId) || state.locked.includes(itemId)) return state;
  if (groupId !== 'tray' && !state.groupIds.includes(groupId)) return state;
  if (state.positions[itemId] === groupId) return state;
  return { ...state, positions: { ...state.positions, [itemId]: groupId } };
}

/** Locked answers alone never consume another try; a new, placed item is required. */
export function canCheck(state: OrganizerState): boolean {
  return state.order.some((id) => !state.locked.includes(id) && state.positions[id] !== 'tray');
}
export function isDone(state: OrganizerState): boolean {
  return state.order.length > 0 && state.locked.length === state.order.length;
}

export function check(state: OrganizerState, set: OrganizerSet): OrganizerState {
  if (!canCheck(state) || isDone(state)) return state;
  const positions = { ...state.positions };
  const locked = [...state.locked];
  const returned: string[] = [];
  let right = 0;
  const answers = new Map(set.items.map((item) => [item.id, item.group]));
  for (const id of state.order) {
    if (state.locked.includes(id) || positions[id] === 'tray') continue;
    if (positions[id] === answers.get(id)) { locked.push(id); right++; }
    else { positions[id] = 'tray'; returned.push(id); }
  }
  return { ...state, positions, locked, tries: state.tries + 1, last: { right, returned } };
}

export function resultInWords(state: OrganizerState): string {
  return state.last
    ? `${state.last.right} right, ${state.last.returned.length} back in the tray to try again.`
    : 'place at least one item, then check.';
}

/** What the check says, and where keyboard focus should land after a real attempt. */
export interface OrganizerCheckOutcome {
  next: OrganizerState;
  message: string;
  focus: 'feedback' | 'summary' | null;
}
export function checkOutcome(state: OrganizerState, set: OrganizerSet): OrganizerCheckOutcome {
  const next = check(state, set);
  return {
    next,
    message: resultInWords(next),
    // An unchanged check must not take focus away from the student's current control.
    focus: next === state ? null : isDone(next) ? 'summary' : 'feedback',
  };
}

export function summary(state: OrganizerState): string {
  const count = isDone(state) ? `all ${state.order.length}` : `${state.locked.length} of ${state.order.length}`;
  return `${count} sorted in ${state.tries} ${state.tries === 1 ? 'try' : 'tries'}.`;
}
