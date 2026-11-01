/** Account display data only: no sign-in, storage, network calls or page wiring. */
export type AccountState =
  | { signedIn: false }
  | {
    signedIn: true;
    displayName: string;
    onboarding?: { school?: string | null } | null;
  };

export interface AccountMenuItem {
  id: 'create-account' | 'sign-in' | 'name' | 'school' | 'profile' | 'settings' | 'sign-out';
  label: string;
  /** Routes are supplied when the account pages are wired up. */
  href?: string;
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const visibleInitial = /[\p{L}\p{N}\p{Extended_Pictographic}\p{Regional_Indicator}]/u;

function firstInitial(word: string): string {
  for (const { segment } of graphemes.segment(word)) {
    if (visibleInitial.test(segment)) return segment;
  }
  return '';
}

function capital(initial: string): string {
  // An uppercase expansion (for example ß → SS) must leave room for the last initial.
  return [...graphemes.segment(initial.toLocaleUpperCase())][0]?.segment ?? '';
}

export function initialsFor(displayName: string | null, email: string): string {
  const initials = (displayName ?? '').trim().split(/\s+/u).map(firstInitial).filter(Boolean);
  if (initials.length) {
    return capital(initials[0]) + (initials.length > 1 ? capital(initials[initials.length - 1]) : '');
  }
  return capital(firstInitial(email.split('@', 1)[0])) || '?';
}

export function accountMenu(state: AccountState): AccountMenuItem[] {
  if (!state.signedIn) return [
    { id: 'create-account', label: 'create free account' },
    { id: 'sign-in', label: 'sign in' },
  ];

  const items: AccountMenuItem[] = [{ id: 'name', label: state.displayName }];
  const school = state.onboarding?.school;
  if (school?.trim()) items.push({ id: 'school', label: school });
  return [
    ...items,
    { id: 'profile', label: 'see profile' },
    { id: 'settings', label: 'account settings' },
    { id: 'sign-out', label: 'sign out' },
  ];
}
