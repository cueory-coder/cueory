/**
 * The few GitHub REST calls the staging auto-merge needs (D-39). Uses Node's built-in fetch, so there is no
 * dependency; tests pass their own fetch. API reference: https://docs.github.com/en/rest/pulls/pulls
 */
import type { ChangedFile, CheckRun, IssueComment, PullRequest } from './decide.ts';

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export class GitHubError extends Error {
  // A plain field, not a constructor parameter property: Node runs this file by stripping types only.
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const PAGE_SIZE = 100;
/** GitHub lists at most 3,000 files for a pull request (30 pages of 100). */
const MAX_PAGES = 30;

export function createGitHub({
  token,
  repo,
  fetch = globalThis.fetch,
  apiUrl = 'https://api.github.com',
}: {
  token: string;
  repo: string;
  fetch?: Fetch;
  apiUrl?: string;
}) {
  async function call(method: string, path: string, body?: unknown): Promise<unknown> {
    const res = await fetch(`${apiUrl}/repos/${repo}${path}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      // The response text can name the problem; it never contains the token.
      const detail = (await res.text()).slice(0, 300);
      throw new GitHubError(res.status, `${method} ${path} failed with ${res.status}: ${detail}`);
    }
    return res.status === 204 ? null : res.json();
  }

  async function all<T>(path: string, pick: (page: unknown) => T[]): Promise<T[]> {
    const out: T[] = [];
    const sep = path.includes('?') ? '&' : '?';
    for (let page = 1; page <= MAX_PAGES; page++) {
      const items = pick(await call('GET', `${path}${sep}per_page=${PAGE_SIZE}&page=${page}`));
      out.push(...items);
      if (items.length < PAGE_SIZE) break;
    }
    return out;
  }

  return {
    /** Open pull requests into one branch (the list endpoint doesn't say whether they merge cleanly). */
    openPulls: (base: string) =>
      all<{ number: number }>(`/pulls?state=open&base=${encodeURIComponent(base)}`, (p) => p as { number: number }[]),
    pull: async (n: number) => (await call('GET', `/pulls/${n}`)) as PullRequest,
    files: (n: number) => all<ChangedFile>(`/pulls/${n}/files`, (p) => p as ChangedFile[]),
    checks: (sha: string) =>
      all<CheckRun>(`/commits/${sha}/check-runs`, (p) => (p as { check_runs: CheckRun[] }).check_runs),
    comments: (n: number) => all<IssueComment>(`/issues/${n}/comments`, (p) => p as IssueComment[]),
    /** Merge commit, and only if the head is still the commit that was checked (`sha`). */
    merge: (n: number, sha: string) => call('PUT', `/pulls/${n}/merge`, { merge_method: 'merge', sha }),
    hasLabel: async (name: string) => {
      try {
        await call('GET', `/labels/${encodeURIComponent(name)}`);
        return true;
      } catch (e) {
        if (e instanceof GitHubError && e.status === 404) return false;
        throw e;
      }
    },
    createLabel: (name: string, description: string) =>
      call('POST', '/labels', { name, color: 'b60205', description }),
    addLabel: (n: number, name: string) => call('POST', `/issues/${n}/labels`, { labels: [name] }),
  };
}

export type GitHub = ReturnType<typeof createGitHub>;
