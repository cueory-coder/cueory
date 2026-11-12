import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DEFAULT_SUDOKU_SETTINGS,
  SUDOKU_SETTINGS_STORAGE_KEY,
  parseSudokuSettings,
  serializeSudokuSettings,
} from '../../src/islands/sudoku';

describe('sudoku settings persistence', () => {
  it('has a versioned per-device key and complete safe defaults', () => {
    expect(SUDOKU_SETTINGS_STORAGE_KEY).toBe('cueory-sudoku-settings-v1');
    expect(DEFAULT_SUDOKU_SETTINGS).toEqual({
      checkOnEntry: false,
      showErrors: true,
      showTimer: true,
      highlightConflicts: true,
      highlightUnits: true,
      highlightBox: true,
      highlightSame: true,
      autoCandidates: false,
      playSoundOnSolve: false,
    });
  });

  it('restores only version-one booleans and falls back safely for corrupt data', () => {
    expect(parseSudokuSettings(JSON.stringify({ version: 1, settings: { autoCandidates: true, playSoundOnSolve: true, showTimer: false } }))).toEqual({
      ...DEFAULT_SUDOKU_SETTINGS,
      autoCandidates: true,
      playSoundOnSolve: true,
      showTimer: false,
    });
    expect(parseSudokuSettings('{not-json')).toEqual(DEFAULT_SUDOKU_SETTINGS);
    expect(parseSudokuSettings(JSON.stringify({ version: 2, settings: { showTimer: false } }))).toEqual(DEFAULT_SUDOKU_SETTINGS);
    expect(parseSudokuSettings(JSON.stringify({ version: 1, settings: { showTimer: 'false' } }))).toEqual(DEFAULT_SUDOKU_SETTINGS);
  });

  it('serializes a full settings set without allowing unknown values through', () => {
    const saved = serializeSudokuSettings({
      ...DEFAULT_SUDOKU_SETTINGS,
      autoCandidates: true,
      playSoundOnSolve: true,
    });
    expect(JSON.parse(saved)).toEqual({
      version: 1,
      settings: { ...DEFAULT_SUDOKU_SETTINGS, autoCandidates: true, playSoundOnSolve: true },
    });
  });
});

describe('sudoku screen and print presentation', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/islands/SudokuGame.tsx'), 'utf8');
  const styles = readFileSync(resolve(process.cwd(), 'src/styles/global.css'), 'utf8');

  it('keeps the paused board obscured on screen and provides a print-only givens surface', () => {
    expect(source).toContain("{paused ? '×' : value || ''}");
    expect(source).toContain('className="sudoku-print-sheet"');
    expect(source).toContain('cueory.app');
    expect(styles).toContain('.sudoku-print-sheet');
    expect(styles).toContain('@media print');
  });

  it('declares token-based 3 by 3 boundaries in both live and print boards', () => {
    expect(styles).toContain('--sudoku-box-border');
    expect(styles).toContain('nth-child(9n + 3)');
    expect(styles).toContain('nth-child(9n + 6)');
    expect(styles).toContain('nth-child(3)');
    expect(styles).toContain('nth-child(6)');
  });
});
