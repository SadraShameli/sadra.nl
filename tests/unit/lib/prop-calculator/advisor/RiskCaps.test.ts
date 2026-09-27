import { describe, expect, it } from 'vitest';

import { contracts, dollars } from '~/lib/prop-calculator';
import { NO_PERSONAL_CAPS, riskCaps } from '~/lib/prop-calculator/advisor';

describe('riskCaps (PT-19 step 2)', () => {
    it('combines the affordable room and contract cap from resolveRiskAt with the personal caps', () => {
        const caps = riskCaps(dollars(250), contracts(4), NO_PERSONAL_CAPS);

        expect(caps).toEqual({
            affordable: 250,
            dailyProfitCap: null,
            maxContracts: 4,
            maxRiskPerTrade: null,
            maxTradesPerDay: null,
        });
    });

    it('carries a null max contracts through unchanged', () => {
        const caps = riskCaps(dollars(100), null, {
            dailyProfitCap: dollars(400),
            maxRiskPerTrade: dollars(50),
            maxTradesPerDay: 2,
        });

        expect(caps.maxContracts).toBeNull();
        expect(caps.maxRiskPerTrade).toBe(50);
        expect(caps.maxTradesPerDay).toBe(2);
        expect(caps.dailyProfitCap).toBe(400);
    });
});
