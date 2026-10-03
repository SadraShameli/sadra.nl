import { parseArgs } from 'citty';
import { describe, expect, it } from 'vitest';

import {
    type AdviseArguments,
    adviseArguments,
    firmPayoutCountLines,
    readAdviseInputs,
} from '~/cli/commands/prop/advise/command';
import {
    FirmAccountPolicy,
    type LiveTransitionTrigger,
    PayoutCountTotalTrigger,
    PolicySourceKind,
    PolicyVerification,
} from '~/lib/prop-calculator';
import { SizingStage } from '~/lib/prop-calculator/advisor';

const CONFIRMED_SOURCE = {
    fetchedOn: '2026-09-01',
    quote: 'a synthetic test quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Confirmed,
} as const;

class StubTriggerPolicy extends FirmAccountPolicy {
    constructor(private readonly triggers: readonly LiveTransitionTrigger[]) {
        super();
    }

    override liveTriggersFor(): readonly LiveTransitionTrigger[] {
        return this.triggers;
    }
}

const FUNDED_APEX_EOD = [
    '--firm',
    'apex',
    '--variant',
    'eod',
    '--stage',
    'funded',
    '--balance',
    '52000',
    '--highest-eod',
    '52000',
    '--trading-days',
    '5',
    '--payouts',
    '0',
    '--trials',
    '10',
];

function parseAdvise(argv: string[]): AdviseArguments {
    return parseArgs<typeof adviseArguments>(argv, adviseArguments);
}

describe('the advise command says requested payouts are not counted (PT-36m, F-145)', () => {
    const description = adviseArguments['firm-payouts-since-live'].description;

    it('tells the user a payout requested but not yet received is never counted', () => {
        expect(description).toContain(
            'Payouts you have requested but not yet received are never counted',
        );
    });

    it('names both counts it does not add a request in flight to', () => {
        expect(description).toContain('the per-account count');
        expect(description).toContain('this number');
    });

    it('prints that a request in flight is not counted whenever a firm payout count is entered', () => {
        const policy = new StubTriggerPolicy([
            new PayoutCountTotalTrigger(10, CONFIRMED_SOURCE),
        ]);
        const { options, plan } = readAdviseInputs(
            parseAdvise([...FUNDED_APEX_EOD, '--firm-payouts-since-live', '9']),
        );
        const text = firmPayoutCountLines(plan, SizingStage.Funded, {
            ...options,
            accountPolicy: policy,
        }).join(' ');
        expect(text).toContain('applied to the firm-total live trigger');
        expect(text).toContain(
            'a payout you have requested but not yet received is not counted',
        );
    });

    it('does not add the in-flight sentence when no count was entered', () => {
        const policy = new StubTriggerPolicy([
            new PayoutCountTotalTrigger(10, CONFIRMED_SOURCE),
        ]);
        const { options, plan } = readAdviseInputs(
            parseAdvise(FUNDED_APEX_EOD),
        );
        const text = firmPayoutCountLines(plan, SizingStage.Funded, {
            ...options,
            accountPolicy: policy,
        }).join(' ');
        expect(text).not.toContain('requested but not yet received');
    });
});
