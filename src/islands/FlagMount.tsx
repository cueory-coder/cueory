import FlagForm from './FlagForm';
import type { FlagReport } from './flag';

interface Props {
  page: string;
  itemId?: string;
  itemVersionId?: string;
}

/** Stub until Task 63's makeSend is available. */
const stubSend = async (_report: FlagReport): Promise<'sent' | 'too-many' | 'failed'> => 'failed';

/**
 * Mounts FlagForm on the page.
 * signedIn uses Task 55's getSessionState() once available (stub: false).
 * send uses Task 63's makeSend once available (stub: always 'failed').
 */
export default function FlagMount({ page, itemId, itemVersionId }: Props) {
  return (
    <FlagForm
      page={page}
      itemId={itemId}
      itemVersionId={itemVersionId}
      signedIn={false}
      send={stubSend}
    />
  );
}
