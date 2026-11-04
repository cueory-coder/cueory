/**
 * Plain-language messages for database RPC refusals (D-86, D-88).
 * Turns what `check_answer` and `submit_flag` raise into one calm sentence a student can act on.
 *
 * Error messages are read verbatim from the migrations:
 *   check_answer:  supabase/migrations/20261101100000_attempts_and_check_answer.sql
 *   submit_flag:   supabase/migrations/20261101120000_flags_and_submit_flag.sql (PR #110)
 *   delete_my_account: supabase/migrations/20261102110000_delete_my_account.sql (Task 60); its only refusal is
 *                      'sign in to delete your account' (errcode 28000).
 *   update_display_name: supabase/migrations/20261102140000_update_display_name.sql
 *   Task 169: confirmed-email checks in 20261102135000_confirmed_accounts_only.sql use action-specific text
 *                for check_answer/submit_flag and a general message for other RPCs.
 *
 * Never echoes raw database text, SQL, table names or error codes to a student.
 */

export type RpcFunction = 'check_answer' | 'submit_flag' | 'delete_my_account' | 'update_display_name';

/** delete_my_account's refusals (20261102160000_fresh_sign_in_and_name_rules.sql). */
export const DELETE_SIGNED_OUT = 'sign in to delete your account';
export const DELETE_REAUTH = 'please sign in again to delete your account';
/** The SQLSTATE delete_my_account raises when the sign-in is older than 10 minutes. */
export const DELETE_REAUTH_CODE = '28R01';

interface DbError {
  /** PostgreSQL error message (the string after `raise exception`). */
  message?: string;
  /** PostgreSQL SQLSTATE code. */
  code?: string;
}

function isDbError(e: unknown): e is DbError {
  return typeof e === 'object' && e !== null;
}

/** Maps a database error from `fn` to a plain student-facing sentence. */
export function studentMessage(fn: RpcFunction, error: unknown): string {
  if (!isDbError(error)) return 'something went wrong — please try again.';
  const msg = typeof error.message === 'string' ? error.message : '';

  if (fn === 'check_answer') {
    // 20261101100000_attempts_and_check_answer.sql
    if (msg === 'sign in to check an answer') return 'please sign in to check answers.';
    if (msg === 'confirm your email to use this') return 'please confirm your email to check answers — look for the link in your inbox.';
    if (msg === 'an item, the version you were shown and your choices are needed') {
      return 'something went wrong loading the question — please reload the page.';
    }
    if (msg === 'no such question') return 'that question could not be found — it may have been removed.';
    if (msg === 'this question was updated; reload it and answer again') {
      return 'this question was just updated — please reload the page and answer again.';
    }
    if (msg === 'pick between one and five different choices') {
      return 'choose between one and five different answers.';
    }
    if (msg === 'one of those choices is not part of this question') {
      return 'one of those answers is not part of this question — please reload the page.';
    }
    if (msg === 'pick one choice') return 'choose exactly one answer for this question.';
    if (msg === 'too many answers checked this hour; try again later') {
      return "you've checked a lot of answers this hour — try again in a little while.";
    }
  }

  if (fn === 'submit_flag') {
    // supabase/migrations/20261101120000_flags_and_submit_flag.sql (PR #110)
    if (msg === 'sign in to send a report') return 'please sign in to send a report.';
    if (msg === 'confirm your email to use this') return 'please confirm your email to send a report — look for the link in your inbox.';
    if (msg === 'the page must be an address on this site') {
      return 'something went wrong — please try again from the page you were on.';
    }
    if (msg === 'pick what is wrong from the list') return 'choose what is wrong from the list.';
    if (msg === 'the comment is up to 1,000 characters of plain text') {
      return 'keep the comment to 1,000 characters or fewer.';
    }
    if (msg === 'that question was not found') {
      return 'that question could not be found — it may have been removed.';
    }
    if (msg === 'that is a lot of reports; please try again later') {
      return "you've sent a lot of reports recently — please try again later.";
    }
  }

  if (fn === 'delete_my_account') {
    if (msg === DELETE_SIGNED_OUT) return 'please sign in again to delete your account.';
    if (msg === DELETE_REAUTH || error.code === DELETE_REAUTH_CODE) {
      return 'for your safety, please sign in again to delete your account.';
    }
  }

  if (fn === 'update_display_name') {
    // supabase/migrations/20261102140000_update_display_name.sql
    if (msg === 'sign in to change your display name') return 'please sign in again to change your display name.';
    if (msg === 'a display name is 1 to 50 characters of plain text') return 'a name can be 1 to 50 characters of plain text.';
    if (msg === 'that is a lot of name changes; please try again later') {
      return "you've changed your name a lot this hour. please try again later.";
    }
    if (msg === 'your profile was not found') return 'your account could not load. please try again.';
  }

  // All other RPCs keep the general confirmed-email explanation, after the specific action messages above.
  if (msg === 'confirm your email to use this') {
    return 'please confirm your email first. the link is in the email we sent you.';
  }

  return 'something went wrong — please try again.';
}
