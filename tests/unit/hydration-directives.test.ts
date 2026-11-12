/**
 * Guard the explicit hydration decisions in Astro pages and shared components.
 * Every client:load and client:only island must have a path-scoped explanation.
 * Only test files and docs are owned by W10-3; changing an island is separate work.
 */
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

type EagerKind = 'load' | 'only';
type EagerIsland = { file: string; component: string; kind: EagerKind; id: string };
type AllowedIsland = { count: number; reason: string };

// Each item describes an actual eager island on reviewed staging b6435591.
// Keep the reason on one line and update this inventory when an island changes.
// Keys are paths + component names + directive, not fragile line numbers.
const ALLOWED: Record<string, AllowedIsland> = {
  'src/pages/account.astro::AccountSettings::load': { count: 1, reason: 'Account controls need to respond as soon as the settings page opens.' },
  'src/pages/breaks.astro::BreakIdeasList::load': { count: 1, reason: 'The immediately visible shuffle and pick buttons must become usable promptly.' },
  'src/pages/preview/reminders.astro::ReminderOptIn::load': { count: 2, reason: 'The two preview states are shown together to compare their controls.' },
  'src/pages/preview/survey.astro::SurveyPrompt::load': { count: 1, reason: 'The survey preview checks local dismissal state when the page starts.' },
  'src/pages/reset-password.astro::ResetPassword::load': { count: 1, reason: 'The password recovery form is the main action on this page.' },
  'src/pages/signin.astro::SignIn::load': { count: 1, reason: 'Sign-in is the page’s main action and must be ready immediately.' },
  'src/pages/signup.astro::SignIn::load': { count: 1, reason: 'Registration is the page’s main action and must be ready immediately.' },
  'src/components/LessonVisuals.astro::VisualDiagram::only': { count: 1, reason: 'Diagrams are interactive client-rendered visualizations with a text fallback.' },
  'src/components/SiteFooter.astro::FlagMount::only': { count: 1, reason: 'Flag/comment availability depends on browser state; the footer is shared.' },
  'src/pages/account/two-factor.astro::TwoFactor::only': { count: 1, reason: 'Two-factor settings depend on the signed-in browser session.' },
  'src/pages/admin/flags.astro::AdminFlags::only': { count: 1, reason: 'Private report access must be checked in the client and server.' },
  'src/pages/auth/callback.astro::AuthCallback::only': { count: 1, reason: 'The login callback completes using browser session state.' },
  'src/pages/index.astro::ContinueBar::only': { count: 1, reason: 'The continuation link depends on saved progress in this browser.' },
  'src/pages/learn/[lesson]/cards.astro::CardDeck::only': { count: 1, reason: 'Interactive cards use client session state and have a static list fallback.' },
  'src/pages/learn/[lesson]/fill-in.astro::FillInBoard::only': { count: 1, reason: 'The answer board is interactive and has a no-script lesson link.' },
  'src/pages/learn/[lesson]/index.astro::SentenceStepper::only': { count: 1, reason: 'Sentence-by-sentence reading is controlled in the browser; the full lesson is the fallback.' },
  'src/pages/learn/[lesson]/index.astro::LessonVideo::only': { count: 1, reason: 'The optional click-to-play player uses browser interaction, not static video markup.' },
  'src/pages/learn/[lesson]/learn-mode.astro::LearnSession::only': { count: 1, reason: 'Learn-mode attempts stay in a browser-controlled interactive session.' },
  'src/pages/learn/[lesson]/matching.astro::MatchingBoard::only': { count: 1, reason: 'Matching is a stateful keyboard-and-tap game.' },
  'src/pages/learn/[lesson]/organizer.astro::OrganizerBoard::only': { count: 1, reason: 'The organizer depends on live browser interaction.' },
  'src/pages/learn/questions.astro::PublishedQuestions::only': { count: 1, reason: 'Published questions load only after account and permissions checks.' },
  'src/pages/learn/study-skills/label-it.astro::LabelItFromUrl::only': { count: 1, reason: 'The activity loads its public sample set after page load, not in static HTML.' },
  'src/pages/learn/study-skills/questions.astro::QuestionsSample::only': { count: 1, reason: 'The public sample question activity fetches data after page load.' },
  'src/pages/learn/video-sample.astro::LessonVideo::only': { count: 1, reason: 'The video preview remains click-to-play in the browser.' },
  'src/pages/play.astro::PulseGame::only': { count: 1, reason: 'The daily game uses the visitor’s local date and live input state.' },
  'src/pages/play.astro::SudokuGame::only': { count: 1, reason: 'Sudoku uses live state, keyboard controls and local settings.' },
  'src/pages/play.astro::CuewordToday::only': { count: 1, reason: 'The daily crossword selects the visitor’s local-day puzzle.' },
  'src/pages/play.astro::SutureToday::only': { count: 1, reason: 'The word-path activity selects the visitor’s local-day puzzle.' },
  'src/pages/play.astro::GameStatsPanel::only': { count: 1, reason: 'The optional private statistics are derived from local browser storage.' },
  'src/pages/play/hello-cards.astro::HelloCards::only': { count: 1, reason: 'The card interaction runs in the browser with a no-script link.' },
  'src/pages/play/stat.astro::StatGame::only': { count: 1, reason: 'The timed activity depends on client-side controls and local state.' },
  'src/pages/preview/admin-flags.astro::AdminFlags::only': { count: 1, reason: 'This is an interactive sample of the private reports interface.' },
  'src/pages/preview/anatomy-lab.astro::AnatomyLab::only': { count: 1, reason: 'The 3D viewer requires browser graphics after explicit interaction.' },
  'src/pages/preview/body-viewer.astro::BodyViewer::only': { count: 1, reason: 'The browser-only visualizer renders its 3D scene after interaction.' },
  'src/pages/preview/share.astro::ShareSheet::only': { count: 2, reason: 'Two sample share sheets depend on browser APIs and user choice.' },
  'src/pages/preview/states.astro::ErrorBoundaryDemo::only': { count: 1, reason: 'The opt-in preview uses browser state to simulate a render failure after a deliberate button press.' },
  'src/pages/progress.astro::GuestImportOffer::only': { count: 1, reason: 'The guest import offer depends on browser and account progress state.' },
  'src/pages/progress.astro::ProgressPanel::only': { count: 1, reason: 'The progress panel reads local saved progress and account state.' },
  'src/pages/start.astro::Onboarding::only': { count: 1, reason: 'Optional setup answers are read from and saved to browser storage.' },
};

/** Find only .astro files under pages and components, including nested routes. */
function astroFiles(root: string): string[] {
  const paths: string[] = [];
  for (const category of ['pages', 'components']) {
    const directory = join(root, 'src', category);
    const visit = (dir: string): void => {
      for (const item of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, item.name);
        if (item.isDirectory()) visit(path);
        else if (item.isFile() && path.endsWith('.astro')) paths.push(path);
      }
    };
    visit(directory);
  }
  return paths.sort();
}

/** Remove comments and Astro frontmatter before inspecting component tags. */
function markupOnly(source: string): string {
  return source
    .replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')
    // Comments and inline HTML script/style bodies cannot contain actual Astro islands.
    .replace(/<!--[^]*?-->|\{\/\*[^]*?\*\/\}|<(script|style)\b(?:[^"'<>]|"[^"]*"|'[^']*')*>[\s\S]*?<\/\1\s*>/g, '');
}

/** Skip complete native tags too, so their attribute examples cannot become component tags. */
function eagerComponents(source: string): Array<{ component: string; kind: EagerKind }> {
  const html = markupOnly(source);
  const results: Array<{ component: string; kind: EagerKind }> = [];
  const open = /<([A-Za-z][\w.:-]*)\b/g;
  let match: RegExpExecArray | null;
  while ((match = open.exec(html))) {
    let quote = '';
    let expressionDepth = 0;
    let attrs = '';
    let end = -1;
    for (let at = open.lastIndex; at < html.length; at += 1) {
      const character = html[at]!;
      const previous = html[at - 1];
      if (quote) {
        if (character === quote && previous !== '\\') quote = '';
        attrs += ' ';
      } else if (character === '"' || character === "'" || character === '`') {
        quote = character;
        attrs += ' ';
      } else if (character === '{') {
        expressionDepth += 1;
        attrs += ' ';
      } else if (character === '}' && expressionDepth > 0) {
        expressionDepth -= 1;
        attrs += ' ';
      } else if (character === '>' && expressionDepth === 0) {
        end = at;
        break;
      } else {
        attrs += expressionDepth > 0 ? ' ' : character;
      }
    }
    if (end === -1) throw new Error(`Unclosed component tag: ${match[1]}`);
    if (/^[A-Z][\w.]*$/.test(match[1]!)) {
      for (const directive of attrs.matchAll(/(?:^|\s)client:(load|only)(?=[\s=/>]|$)/g)) {
        results.push({ component: match[1]!, kind: directive[1] as EagerKind });
      }
    }
    open.lastIndex = end + 1;
  }
  return results;
}

function collectEagerIslands(root: string): EagerIsland[] {
  return astroFiles(root).flatMap((file) => {
    const path = relative(root, file).split(sep).join('/');
    return eagerComponents(readFileSync(file, 'utf8')).map(({ component, kind }) => ({
      file: path,
      component,
      kind,
      id: `${path}::${component}::${kind}`,
    }));
  });
}

/** Any unexplained new directive or duplicate must fail. */
function checkAllowlist(islands: EagerIsland[], allowed: Record<string, AllowedIsland>): string[] {
  const counts = new Map<string, number>();
  for (const island of islands) counts.set(island.id, (counts.get(island.id) ?? 0) + 1);
  return [...new Set([...counts.keys(), ...Object.keys(allowed)])]
    .sort()
    .flatMap((id) => {
      const actual = counts.get(id) ?? 0;
      const expected = allowed[id]?.count ?? 0;
      return actual === expected ? [] : [`${id}: found ${actual}, explained ${expected}`];
    });
}

const fixtureRoots: string[] = [];
afterEach(() => {
  for (const root of fixtureRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(): { root: string; write: (path: string, source: string) => void } {
  const root = mkdtempSync(join(tmpdir(), 'cueory-eager-islands-'));
  fixtureRoots.push(root);
  for (const part of ['pages', 'components']) mkdirSync(join(root, 'src', part), { recursive: true });
  return {
    root,
    write(path, source) {
      const dest = join(root, path);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, source);
    },
  };
}

describe('eager Astro island hydration', () => {
  it('explains every current client:load and client:only occurrence in pages and components', () => {
    const existing = collectEagerIslands(projectRoot);
    expect(existing.length).toBeGreaterThan(25);
    expect(checkAllowlist(existing, ALLOWED)).toEqual([]);
    for (const { count, reason } of Object.values(ALLOWED)) {
      expect(count).toBeGreaterThan(0);
      expect(reason.trim().length).toBeGreaterThan(15);
    }
  });

  it('counts a non-self-closing trailing eager directive and rejects similar names', () => {
    const f = fixture();
    f.write('src/pages/fixture.astro', [
      '<SignIn mode="signup" client:load></SignIn>',
      '<SampleWidget client:load />',
      '<OnlyWidget client:only="react"></OnlyWidget>',
      '<NotEager client:loading></NotEager>',
    ].join('\n'));
    const found = collectEagerIslands(f.root);
    expect(found.map(({ id }) => id)).toEqual([
      'src/pages/fixture.astro::SignIn::load',
      'src/pages/fixture.astro::SampleWidget::load',
      'src/pages/fixture.astro::OnlyWidget::only',
    ]);
    expect(checkAllowlist(found, {})).toHaveLength(3);
  });

  it('fails on a newly added unexplained eager load', () => {
    const f = fixture();
    f.write('src/pages/new-feature.astro', '<SampleWidget client:load />');
    expect(checkAllowlist(collectEagerIslands(f.root), {})).toEqual([
      'src/pages/new-feature.astro::SampleWidget::load: found 1, explained 0',
    ]);
  });

  it('also fails on a new browser-only island and extra copies of an allowed island', () => {
    const f = fixture();
    f.write('src/components/Widget.astro', '<AnotherWidget client:only="react" /><AnotherWidget client:only="react" />');
    const allowed = { 'src/components/Widget.astro::AnotherWidget::only': { count: 1, reason: 'Already explained.' } };
    expect(checkAllowlist(collectEagerIslands(f.root), allowed)).toEqual([
      'src/components/Widget.astro::AnotherWidget::only: found 2, explained 1',
    ]);
  });

  it('ignores comments, quoted strings, frontmatter and lazy directives', () => {
    const f = fixture();
    f.write('src/pages/fixture.astro', `---\nconst fake = '<Fake client:load />';\n---\n<!-- <Ignored client:only="react" /> -->\n{/* <IgnoredToo client:load /> */}\n<Lazy client:idle /><BelowFold client:visible /><Real title="has > and client:only" client:load />`);
    const found = collectEagerIslands(f.root);
    expect(found.map((island) => island.id)).toEqual(['src/pages/fixture.astro::Real::load']);
  });

  it('ignores eager-looking tags in inline script and style raw text', () => {
    const f = fixture();
    f.write('src/pages/fixture.astro', [
      '<!-- <script>example</script> -->',
      '<script type="module" data-sample="x > y">',
      '  const html = \'<Ghost client:load />\';',
      '  const comment = "<!--";',
      '</script>',
      '<style>',
      '  .hint::after { content: \'<GhostStyle client:only="react" />\'; }',
      '</style>',
      '<Real client:load />',
      '<BrowserOnly client:only="react" />',
    ].join('\n'));
    const found = collectEagerIslands(f.root);
    expect(found.map(({ id }) => id)).toEqual([
      'src/pages/fixture.astro::Real::load',
      'src/pages/fixture.astro::BrowserOnly::only',
    ]);
    expect(checkAllowlist(found, {})).toHaveLength(2);
  });

  it('ignores eager-looking component examples in native-element attributes', () => {
    const f = fixture();
    f.write('src/pages/fixture.astro', [
      '<main>',
      '  <div data-example="<Ghost client:load />"></div>',
      `  <span title='<Phantom client:only="react" />'>sample examples</span>`,
      `  <section data-example={'<ExpressionExample client:load />'}></section>`,
      '  <Real client:load />',
      '</main>',
    ].join('\n'));
    expect(collectEagerIslands(f.root).map(({ id }) => id)).toEqual([
      'src/pages/fixture.astro::Real::load',
    ]);
  });

  it('reads multiline component tags while skipping {expression} contents', () => {
    const f = fixture();
    f.write('src/pages/deep/fixture.astro', `<Real title={value > 3 ? 'client:load' : 'false'}\n client:only="react" /><Lazy client:visible />`);
    expect(collectEagerIslands(f.root).map((x) => x.id)).toEqual([
      'src/pages/deep/fixture.astro::Real::only',
    ]);
  });

  it('keeps a readable no-JavaScript fallback on core interactive study pages', () => {
    const routes = [
      'src/pages/learn/[lesson]/cards.astro',
      'src/pages/learn/[lesson]/fill-in.astro',
      'src/pages/learn/[lesson]/matching.astro',
      'src/pages/learn/[lesson]/organizer.astro',
      'src/pages/learn/questions.astro',
      'src/pages/play.astro',
      'src/pages/play/hello-cards.astro',
      'src/pages/play/stat.astro',
      'src/pages/progress.astro',
      'src/pages/start.astro',
    ];
    for (const route of routes) {
      const source = readFileSync(join(projectRoot, route), 'utf8');
      const fallbacks = [...source.matchAll(/<noscript(?:\s[^>]*)?>([\s\S]*?)<\/noscript>/g)];
      expect(fallbacks.length > 0).toBe(true);
      // Students without JavaScript must get words, not only empty shapes.
      const words = fallbacks.map(match => match[1]!.replace(/<[^>]+>/g, ' ').trim()).join(' ');
      expect(words.length > 14).toBe(true);
    }
  });

  it('keeps no-JavaScript guidance with eager account forms', () => {
    const routes = [
      'src/pages/account.astro', 'src/pages/reset-password.astro',
      'src/pages/signin.astro', 'src/pages/signup.astro',
    ];
    for (const route of routes) {
      const source = readFileSync(join(projectRoot, route), 'utf8');
      expect(/<noscript>\s*<p\b[^>]*>[^<]*javascript/i.test(source)).toBe(true);
    }
  });

  it('detects an unexplained eager directive in a nested component folder', () => {
    const f = fixture();
    f.write('src/components/nested/Example.astro', '<SampleWidget client:only="react" />');
    expect(checkAllowlist(collectEagerIslands(f.root), {})).toEqual([
      'src/components/nested/Example.astro::SampleWidget::only: found 1, explained 0',
    ]);
  });
});
