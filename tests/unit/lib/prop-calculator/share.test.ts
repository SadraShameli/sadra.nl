import { describe, expect, it } from 'vitest';

import {
    decodeShareState,
    encodeShareState,
} from '~/lib/prop-calculator/share';

describe('share state codec', () => {
    const baseRaw = {
        fundedHorizonDays: 60,
        maxEvalDays: 60,
        riskPerTrade: 0.005,
        rrRatio: 2,
        seed: 1,
        tradesPerDay: 3,
        trials: 500,
        winrate: 0.55,
    };

    it('round-trips a valid state', () => {
        const encoded = encodeShareState({
            firmId: 'apex',
            planId: 'apex-25k',
            raw: baseRaw,
        });
        const decoded = decodeShareState(encoded);
        expect(decoded).not.toBeNull();
        expect(decoded?.firmId).toBe('apex');
        expect(decoded?.planId).toBe('apex-25k');
        expect(decoded?.raw.winrate).toBe(0.55);
    });

    it('returns null for garbage', () => {
        expect(decodeShareState('not-base64$$$')).toBeNull();
    });

    it('rejects payloads with invalid inputs', () => {
        const encoded = encodeShareState({
            firmId: 'apex',
            planId: 'apex-25k',
            raw: { ...baseRaw, winrate: 2.5 },
        });
        const decoded = decodeShareState(encoded);
        expect(decoded).toBeNull();
    });
});
