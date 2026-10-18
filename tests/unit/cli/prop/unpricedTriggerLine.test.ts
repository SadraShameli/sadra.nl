import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    unpricedTriggerLine,
    UnpricedTriggerSurface,
} from '~/cli/commands/prop/unpricedTrigger';
import {
    CumulativeAmountTrigger,
    dollars,
    findFirm,
    FirmId,
    type FirmPolicySource,
    MffuVariant,
    PolicySourceKind,
    PolicyVerification,
} from '~/lib/prop-calculator';

const URL = 'https://example.invalid/rule';
const QUOTE = 'a synthetic quote';
const FETCHED_ON = '2026-09-26';

function mffuPlan() {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFF Rapid EOD 50K plan not found');
    return plan;
}

function stubTrigger(source: FirmPolicySource) {
    const firm = findFirm(FirmId.Mffu);
    if (!firm) throw new Error('MFFU not registered');
    vi.spyOn(firm.accountPolicy, 'liveTriggersFor').mockReturnValue([
        new CumulativeAmountTrigger(dollars(1500), source),
    ]);
}

const CONFIRMED_SOURCE: FirmPolicySource = {
    fetchedOn: FETCHED_ON,
    quote: QUOTE,
    sourceKind: PolicySourceKind.LiveFetch,
    url: URL,
    verification: PolicyVerification.Confirmed,
};

const CONFLICT_SOURCE: FirmPolicySource = {
    conflicting: {
        fetchedOn: FETCHED_ON,
        quote: 'other',
        sourceKind: PolicySourceKind.LiveFetch,
        url: 'https://example.invalid/other',
    },
    fetchedOn: FETCHED_ON,
    quote: QUOTE,
    sourceKind: PolicySourceKind.LiveFetch,
    url: URL,
    verification: PolicyVerification.Conflict,
};

describe('unpricedTriggerLine says a command does not price a confirmed cumulative trigger (PT-36t, F-145)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('says nothing for a plan with no confirmed trigger', () => {
        for (const surface of Object.values(UnpricedTriggerSurface)) {
            expect(unpricedTriggerLine(mffuPlan(), surface)).toBeNull();
        }
    });

    it('says nothing for a trigger the firm pages disagree on', () => {
        stubTrigger(CONFLICT_SOURCE);
        for (const surface of Object.values(UnpricedTriggerSurface)) {
            expect(unpricedTriggerLine(mffuPlan(), surface)).toBeNull();
        }
    });

    it('names the amount, the source and the quote of the confirmed trigger and says it is not priced', () => {
        stubTrigger(CONFIRMED_SOURCE);
        for (const surface of Object.values(UnpricedTriggerSurface)) {
            const line = unpricedTriggerLine(mffuPlan(), surface);
            expect(line).toContain('not priced');
            expect(line).toContain('$1,500');
            expect(line).toContain(URL);
            expect(line).toContain(FETCHED_ON);
            expect(line).toContain(QUOTE);
            expect(line).not.toContain('\u{2014}');
        }
    });

    it('gives each command its own reason after the shared wording', () => {
        stubTrigger(CONFIRMED_SOURCE);
        const dp = unpricedTriggerLine(mffuPlan(), UnpricedTriggerSurface.Dp);
        const ladder = unpricedTriggerLine(
            mffuPlan(),
            UnpricedTriggerSurface.Ladder,
        );
        expect(dp).not.toBe(ladder);
        expect(dp).toContain('simulate()');
        expect(ladder).toContain('eval phase only');
    });
});
