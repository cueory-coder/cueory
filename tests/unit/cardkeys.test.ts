import { describe, expect, it } from 'vitest';
import { cardKeyAction } from '../../src/islands/cardkeys';

const basic = (key: string) => ({ key, metaKey: false, ctrlKey: false, altKey: false, target: null });
const inField = (key: string, tag: string) => ({ ...basic(key), target: { tagName: tag } });
const editable = (key: string) => ({ ...basic(key), target: { tagName: 'DIV', isContentEditable: true } });

describe('cardKeyAction', () => {
  it('Space → flip', () => {
    expect(cardKeyAction(basic(' '))).toBe('flip');
  });

  it('ArrowLeft → back', () => {
    expect(cardKeyAction(basic('ArrowLeft'))).toBe('back');
  });

  it('ArrowRight → advance', () => {
    expect(cardKeyAction(basic('ArrowRight'))).toBe('advance');
  });

  it('1 → know', () => {
    expect(cardKeyAction(basic('1'))).toBe('know');
  });

  it('2 → learning', () => {
    expect(cardKeyAction(basic('2'))).toBe('learning');
  });

  it('s → star', () => {
    expect(cardKeyAction(basic('s'))).toBe('star');
  });

  it('S → star (uppercase)', () => {
    expect(cardKeyAction(basic('S'))).toBe('star');
  });

  it('unrecognised key → null', () => {
    expect(cardKeyAction(basic('a'))).toBeNull();
    expect(cardKeyAction(basic('Enter'))).toBeNull();
    expect(cardKeyAction(basic('Escape'))).toBeNull();
  });

  it('Space in INPUT field → null', () => {
    expect(cardKeyAction(inField(' ', 'INPUT'))).toBeNull();
  });

  it('Space in TEXTAREA → null', () => {
    expect(cardKeyAction(inField(' ', 'TEXTAREA'))).toBeNull();
  });

  it('Space in SELECT → null', () => {
    expect(cardKeyAction(inField(' ', 'SELECT'))).toBeNull();
  });

  it('Space on contentEditable element → null', () => {
    expect(cardKeyAction(editable(' '))).toBeNull();
  });

  it('Arrow keys in INPUT → null', () => {
    expect(cardKeyAction(inField('ArrowLeft', 'INPUT'))).toBeNull();
    expect(cardKeyAction(inField('ArrowRight', 'INPUT'))).toBeNull();
  });

  it('cmd+Space → null (meta modifier)', () => {
    expect(cardKeyAction({ key: ' ', metaKey: true, ctrlKey: false, altKey: false, target: null })).toBeNull();
  });

  it('ctrl+ArrowLeft → null (ctrl modifier)', () => {
    expect(cardKeyAction({ key: 'ArrowLeft', metaKey: false, ctrlKey: true, altKey: false, target: null })).toBeNull();
  });

  it('alt+1 → null (alt modifier)', () => {
    expect(cardKeyAction({ key: '1', metaKey: false, ctrlKey: false, altKey: true, target: null })).toBeNull();
  });

  it('Space on a focused button, link or summary → null, so Space still presses it', () => {
    expect(cardKeyAction(inField(' ', 'BUTTON'))).toBeNull();
    expect(cardKeyAction(inField(' ', 'A'))).toBeNull();
    expect(cardKeyAction(inField(' ', 'SUMMARY'))).toBeNull();
    expect(cardKeyAction(inField(' ', 'button'))).toBeNull();
  });

  it('Space on the card itself (a div) → flip', () => {
    expect(cardKeyAction(inField(' ', 'DIV'))).toBe('flip');
  });

  it('other shortcuts still work while a button has focus', () => {
    expect(cardKeyAction(inField('1', 'BUTTON'))).toBe('know');
    expect(cardKeyAction(inField('2', 'BUTTON'))).toBe('learning');
    expect(cardKeyAction(inField('s', 'BUTTON'))).toBe('star');
    expect(cardKeyAction(inField('ArrowRight', 'BUTTON'))).toBe('advance');
  });

  it('1, 2 and S while typing in a field → null', () => {
    expect(cardKeyAction(inField('1', 'INPUT'))).toBeNull();
    expect(cardKeyAction(inField('2', 'TEXTAREA'))).toBeNull();
    expect(cardKeyAction(inField('s', 'INPUT'))).toBeNull();
    expect(cardKeyAction(editable('S'))).toBeNull();
  });

  it('a held-down key repeating → null', () => {
    expect(cardKeyAction({ ...basic(' '), repeat: true })).toBeNull();
    expect(cardKeyAction({ ...basic('1'), repeat: true })).toBeNull();
  });

  it('target null → does not throw', () => {
    expect(() => cardKeyAction({ key: ' ', target: null })).not.toThrow();
  });

  it('target undefined → does not throw', () => {
    expect(() => cardKeyAction({ key: ' ', target: undefined })).not.toThrow();
  });
});
