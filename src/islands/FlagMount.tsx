import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FlagForm from './FlagForm';
import { flagSignedIn, makeFlagSend, type FlagClient, type LoadFlagClient } from './flagconnect';
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
 * browser is idle (like the account corner) or as soon as the student opens the form, whichever comes first.
 */
export default function FlagMount({ page, itemId, itemVersionId, variant }: Props) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const started = useRef(false);
  const send = useMemo(() => makeFlagSend(loadShared), []);
  const check = useCallback(() => {
    if (started.current) return;
    started.current = true;
    void flagSignedIn(loadShared).then(setSignedIn);
  }, []);

  useEffect(() => {
    if ('requestIdleCallback' in window) {
      const handle = window.requestIdleCallback(check, { timeout: 2500 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = setTimeout(check, 100);
    return () => clearTimeout(timer);
  }, [check]);

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
