import { describe, expect, it } from 'vitest';

import { MarketStatus, NyseBell } from '~/lib/site/NyseBell';

describe('NyseBell', () => {
    it('reads New York wall-clock time and counts down to the closing bell during the session', () => {
        const bell = new NyseBell(new Date('2026-10-16T14:00:00Z'));

        expect(bell.wallClock).toBe('10:00:00');
        expect(bell.status).toBe(MarketStatus.Open);
        expect(bell.countdown).toBe('06:00:00');
    });

    it('counts down to the opening bell before the session on a weekday', () => {
        const bell = new NyseBell(new Date('2026-10-19T12:00:00Z'));

        expect(bell.status).toBe(MarketStatus.Closed);
        expect(bell.countdown).toBe('01:30:00');
    });

    it('skips the weekend after the Friday close', () => {
        const bell = new NyseBell(new Date('2026-10-16T20:30:15Z'));

        expect(bell.status).toBe(MarketStatus.Closed);
        expect(bell.secondsUntilNextBell).toBe(233_985);
        expect(bell.countdown).toBe('64:59:45');
    });

    it('turns the hands to the New York time', () => {
        const bell = new NyseBell(new Date('2026-10-14T19:45:30Z'));

        expect(bell.hourHandDegrees).toBe(112.5);
        expect(bell.minuteHandDegrees).toBe(273);
        expect(bell.secondHandDegrees).toBe(180);
    });

    it('treats the closing bell itself as closed', () => {
        const bell = new NyseBell(new Date('2026-10-14T20:00:00Z'));

        expect(bell.status).toBe(MarketStatus.Closed);
        expect(bell.countdown).toBe('17:30:00');
    });
});
