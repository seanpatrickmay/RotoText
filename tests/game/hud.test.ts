import { describe, expect, it } from 'vitest';
import { END_MESSAGE, hudLabel } from '../../src/ui/gameHud';

describe('hudLabel', () => {
  it('shows a 1-based level number, the count and the name', () => {
    expect(hudLabel(2, 7, 'Star')).toBe('3 / 7 · Star');
  });

  it('has the agreed end copy', () => {
    expect(END_MESSAGE).toBe('You found every line of sight');
  });
});
