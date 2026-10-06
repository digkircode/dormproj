import { moscowDateOnly } from './period-utils';

describe('moscowDateOnly', () => {
  it('uses the Moscow date after local midnight while UTC is still on the previous day', () => {
    expect(moscowDateOnly(new Date('2026-10-06T21:30:00Z')).toISOString()).toBe('2026-10-07T00:00:00.000Z');
  });

  it('does not advance before Moscow midnight', () => {
    expect(moscowDateOnly(new Date('2026-10-07T20:59:00Z')).toISOString()).toBe('2026-10-07T00:00:00.000Z');
  });
});
