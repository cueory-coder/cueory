import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('progress words check', () => {
  it('does not contain student-facing "master" in UI source files', () => {
    const root = path.resolve(__dirname, '../../src');
    const checkedDirs = ['components', 'pages', 'layouts', 'config'];
    
    const violations: { file: string; line: number; text: string }[] = [];

    function scan(dir: string) {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scan(fullPath);
        } else if (/\.(astro|tsx?|jsx?)$/.test(entry.name)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');
          lines.forEach((line, idx) => {
            // Check for student-facing UI text containing master
            if (/\b(master|mastered|mastery)\b/i.test(line)) {
              violations.push({ file: fullPath, line: idx + 1, text: line.trim() });
            }
          });
        }
      }
    }

    for (const d of checkedDirs) {
      scan(path.join(root, d));
    }

    // Also scan LearnSession.tsx UI jsx specifically
    const learnSession = fs.readFileSync(path.join(root, 'islands/LearnSession.tsx'), 'utf8');
    const jsxLines = learnSession.split('\n').filter((l) => /<|aria-|>/.test(l));
    jsxLines.forEach((line, idx) => {
      if (/\b(master|mastered|mastery)\b/i.test(line)) {
        violations.push({ file: 'src/islands/LearnSession.tsx', line: idx + 1, text: line.trim() });
      }
    });

    expect(violations).toEqual([]);
  });
});
