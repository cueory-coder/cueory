/**
 * Account corner display rules only. The real session comes from Task 55; access
 * control remains on the server. No DOM, storage, network, or secret keys here.
 */
import { accountMenu, initialsFor, type AccountMenuItem, type AccountState } from '../islands/account';
import type { SessionState } from '../islands/supabaseclient';
import { accountHref } from '../config/site';

export interface CornerProfile {
  display_name?: string | null;
  /** Available when onboarding data is supplied by a later account task. */
  onboarding?: { school?: string | null } | null;
}

export interface CornerItem extends AccountMenuItem {
  /** Only the accounts-off menu calls these links "coming soon". */
  note?: string;
}

export interface CornerView {
  accountsEnabled: boolean;
  account: AccountState;
  initials: string | null;
  items: CornerItem[];
}

/** Turn the signed-in session and the student's own profile into the existing AccountState. */
export function cornerState(session: SessionState, profile: CornerProfile | null = null): AccountState {
  if (!session.signedIn) return { signedIn: false };

  const name = profile?.display_name;
  const displayName = typeof name === 'string' && name.trim() !== '' ? name : 'your account';
  const school = profile?.onboarding?.school;
  // The profiles database currently has no school field; never invent one.
  return {
    signedIn: true,
    displayName,
    ...(typeof school === 'string' && school.trim() !== '' ? { onboarding: { school } } : {}),
  };
}

/** Avatar initials, menu labels and routes for the current state. */
export function cornerView(
  session: SessionState,
  profile: CornerProfile | null,
  accountsEnabled: boolean,
): CornerView {
  const account = cornerState(accountsEnabled ? session : { signedIn: false }, profile);
  const initials = account.signedIn && session.signedIn
    ? initialsFor(profile?.display_name ?? null, session.email)
    : null;

  const items: CornerItem[] = accountMenu(account).map((item) => {
    if (item.id === 'create-account' || item.id === 'sign-in') {
      return {
        ...item,
        // Task 58's contract: both routes go to /signin until Task 56 is released.
        href: accountsEnabled ? '/signin' : accountHref,
        ...(accountsEnabled ? {} : { note: 'coming soon' }),
      };
    }
    if (item.id === 'profile' || item.id === 'settings') return { ...item, href: '/account' };
    return item;
  });

  return { accountsEnabled, account, initials, items };
}

export type GetCornerClient = () => Promise<object | null>;
export type GetCornerSession = () => Promise<SessionState>;
export type GetCornerProfile = (userId: string) => Promise<CornerProfile | null>;

/**
 * Read a client only when the caller runs this (after idle in AccountCorner).
 * Accounts off or a failed package load retain the original local-only menu.
 * Failure to read a session is signed-out; failure to read the optional profile
 * still shows the student's initials from their email.
 */
export async function loadCorner(
  getClient: GetCornerClient,
  getSession: GetCornerSession,
  getProfile: GetCornerProfile,
): Promise<CornerView> {
  const signedOut: SessionState = { signedIn: false };
  let client: object | null;
  try {
    client = await getClient();
  } catch {
    return cornerView(signedOut, null, false);
  }
  if (client === null) return cornerView(signedOut, null, false);

  let session = signedOut;
  try {
    session = await getSession();
  } catch {
    // A rejected session read must never reveal account information.
  }

  let profile: CornerProfile | null = null;
  if (session.signedIn) {
    try {
      profile = await getProfile(session.userId);
    } catch {
      // Profile is optional; email initials and "your account" remain usable.
    }
  }
  return cornerView(session, profile, true);
}
