import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FlagForm from './FlagForm';
import { makeFlagSend, watchFlagSession, type FlagClient, type FlagSessionWatch, type LoadFlagClient } from './flagconnect';
import { getSupabase } from './supabaseclient';

interface Props {
  page: string;
  itemId?: string;
  itemVersionId?: string;
  variant?: 'text' | 'icon';
}

/** The page's shared client. With accounts off it is null and the Supabase package is never downloaded. */
const loadShared: LoadFlagClient = () => getSupabase() as unknown as Promise<FlagClient | null>;

/**
 * Mounts FlagForm on the page (Task 171). Signed-in state comes from the browser's real session, checked once the
 * browser is idle (like the account corner) and again every time the student opens the form. Once the client has
 * loaded, a sign-in or sign-out in this tab or another one updates the form too, so it is never stuck on the first answer.
 */
export default function FlagMount({ page, itemId, itemVersionId, variant }: Props) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const watch = useRef<FlagSessionWatch | null>(null);
  const send = useMemo(() => makeFlagSend(loadShared), []);
  const check = useCallback(() => watch.current?.check(), []);

  useEffect(() => {
    const current = watchFlagSession(loadShared, setSignedIn);
    watch.current = current;
    let cancelIdle: () => void;
    if ('requestIdleCallback' in window) {
      const handle = window.requestIdleCallback(() => current.check(), { timeout: 2500 });
      cancelIdle = () => window.cancelIdleCallback(handle);
    } else {
      const timer = setTimeout(() => current.check(), 100);
      cancelIdle = () => clearTimeout(timer);
    }
    return () => {
      cancelIdle();
      current.stop();
      if (watch.current === current) watch.current = null;
    };
  }, []);

  return (
    <FlagForm
      page={page}
      itemId={itemId}
      itemVersionId={itemVersionId}
      signedIn={signedIn}
      send={send}
      onOpen={check}
      variant={variant}
    />
  );
}
