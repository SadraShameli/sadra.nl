import { describe, expect, it } from 'vitest';

import {
    describePayoutSplit,
    planHeadline,
    planRuleLines,
} from '~/cli/commands/prop/plans/command';
import { planResolver } from '~/cli/commands/prop/shared';
import {
    AlphaFuturesVariant,
    ApexVariant,
    dollars,
    E8FuturesVariant,
    FirmId,
    fraction,
    FtmoFuturesVariant,
    FundedNextVariant,
    MffuVariant,
    type PayoutCountSplitTier,
    PayoutCountTieredPayoutSplit,
    PayoutFloorEffect,
    type Plan,
    type PlanId,
    TopStepVariant,
    TradeifyVariant,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';

function linesFor(planId: PlanId): string[] {
    return planRuleLines(planFor(planId));
}

function planFor(planId: PlanId): Plan {
    const plan = findFirm(planId.firm)?.findPlan(planId);
    if (!plan) throw new Error(`plan not found: ${JSON.stringify(planId)}`);
    return plan;
}

function singleSplit(share: number): PayoutCountSplitTier {
    return {
        fromPayoutIndex: 0,
        tiers: [{ thresholdProfit: dollars(0), traderShare: fraction(share) }],
    };
}

function splitStep(
    fromPayoutIndex: number,
    share: number,
): PayoutCountSplitTier {
    return { ...singleSplit(share), fromPayoutIndex };
}

const ftmoGrowth = {
    accountSize: 50_000,
    firm: FirmId.FtmoFutures,
    variant: FtmoFuturesVariant.Growth,
} as const;
const ftmoPro = {
    accountSize: 50_000,
    firm: FirmId.FtmoFutures,
    variant: FtmoFuturesVariant.Pro,
} as const;
const topStepXfa = {
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
} as const;
const topStepPro = {
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.ProAccount,
} as const;
const signatureE8 = {
    accountSize: 50_000,
    firm: FirmId.E8Futures,
    variant: E8FuturesVariant.Signature,
} as const;
const zeroMaxE8 = {
    accountSize: 50_000,
    firm: FirmId.E8Futures,
    variant: E8FuturesVariant.ZeroMax80,
} as const;
const apexEod = {
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
} as const;
const mffPro = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
} as const;
const tpt = { accountSize: 50_000, firm: FirmId.Tpt } as const;
const legacy = {
    accountSize: 50_000,
    firm: FirmId.FundedNext,
    variant: FundedNextVariant.Legacy,
} as const;
const selectFlex = {
    accountSize: 50_000,
    firm: FirmId.Tradeify,
    variant: TradeifyVariant.SelectFlex,
} as const;
const alphaStandard = {
    accountSize: 50_000,
    firm: FirmId.AlphaFutures,
    variant: AlphaFuturesVariant.Standard,
} as const;
const alphaAdvanced = {
    accountSize: 50_000,
    firm: FirmId.AlphaFutures,
    variant: AlphaFuturesVariant.Advanced,
} as const;

describe('planHeadline', () => {
    it('names the plan with its --firm and --variant flags', () => {
        expect(planHeadline(planFor(ftmoGrowth))).toBe(
            '$50K — Growth  --firm ftmo-futures --variant growth',
        );
    });
});

describe('planHeadline call-up tag (D3)', () => {
    it('tags the TopStep Pro Account call-up only', () => {
        const headline = planHeadline(
            planFor({
                accountSize: 50_000,
                firm: FirmId.TopStep,
                variant: TopStepVariant.ProAccount,
            }),
        );
        expect(headline.endsWith('[call-up only]')).toBe(true);
    });

    it('does not tag a purchasable XFA plan', () => {
        const headline = planHeadline(
            planFor({
                accountSize: 50_000,
                firm: FirmId.TopStep,
                variant: TopStepVariant.StandardStandard,
            }),
        );
        expect(headline).not.toContain('call-up');
    });
});

describe('planRuleLines: payout caps (R1-44)', () => {
    it('shows the FTMO Growth 50% of total profit cap next to its $2,500 request cap', () => {
        expect(linesFor(ftmoGrowth)).toContain(
            '    payout cap 50% of total profit, max $2,500 per request',
        );
    });

    it('shows the FTMO Pro 100% of total profit cap next to its $5,000 request cap', () => {
        expect(linesFor(ftmoPro)).toContain(
            '    payout cap 100% of total profit, max $5,000 per request',
        );
    });

    it('shows the 50% of total profit cap on Tradeify Select Flex and TopStep XFA', () => {
        for (const planId of [selectFlex, topStepXfa]) {
            expect(
                linesFor(planId).some((line) =>
                    line.includes('50% of total profit'),
                ),
            ).toBe(true);
        }
    });

    it('shows the E8 Signature cap steps by payout number', () => {
        expect(linesFor(signatureE8)).toContain(
            '    payout cap by payout: #1+ max $1,250 per request | #3+ max $2,250 per request | #5+ max $3,250 per request',
        );
    });

    it('shows the FundedNext Legacy cap lifting at exactly 30 benchmark days', () => {
        expect(linesFor(legacy)).toContain(
            '    payout cap by qualifying days: day 0+ 50% of total profit, max $6,000 per request | day 30+ uncapped',
        );
    });

    it('shows the Alpha Futures Standard Qualified consistency rule as inclusive and failing on a net-losing cycle', () => {
        const ruleLine = linesFor(alphaStandard).find((line) =>
            line.includes('consistency eval'),
        );

        expect(ruleLine).toContain(
            '| funded 40% (inclusive, fails on a net-losing cycle)',
        );
    });

    it('keeps a plain exclusive consistency rule as a bare percentage', () => {
        const ruleLine = linesFor(topStepXfa).find((line) =>
            line.includes('consistency eval'),
        );

        expect(ruleLine).toContain('consistency eval 55%');
    });

    it('shows the Alpha Futures 50% of account profit cap', () => {
        expect(linesFor(alphaStandard)).toContain(
            '    payout cap 50% of total profit, max $3,000 per request',
        );
    });

    it('prints no payout cap line for an uncapped plan', () => {
        expect(
            linesFor(apexEod).some((line) => line.startsWith('    payout cap')),
        ).toBe(false);
    });

    it('never prints the old per-request cap dollar line', () => {
        const plans = planResolver.resolveMany({});
        for (const plan of plans) {
            expect(
                planRuleLines(plan).some((line) =>
                    line.includes('per-request cap $'),
                ),
            ).toBe(false);
        }
    });
});

describe('planRuleLines: eval and funded drawdown (R1-45)', () => {
    it('shows the TPT eval EOD drawdown and the funded intraday drawdown', () => {
        const lines = linesFor(tpt);
        expect(lines[0]).toContain(
            'eval drawdown $2,000 eod-trailing, locks at +$2,000 to breakeven',
        );
        expect(lines).toContain(
            '    funded drawdown $2,000 intraday-trailing, locks at +$2,000 to breakeven',
        );
    });

    it('shows one drawdown line for FTMO Growth, whose drawdown is the same in both stages', () => {
        const lines = linesFor(ftmoGrowth);
        expect(lines[0]).toContain(
            'drawdown $2,000 eod-trailing, locks at +$2,000 to breakeven',
        );
        expect(lines[0]).not.toContain('eval drawdown');
        expect(lines.some((line) => line.includes('funded drawdown'))).toBe(
            false,
        );
    });

    it('shows the E8 Zero lock-free Challenge and the funded lock that also fires on the 1st payout', () => {
        const lines = linesFor(zeroMaxE8);
        expect(lines[0]).toContain(
            'eval drawdown $1,500 eod-trailing, no lock',
        );
        expect(lines).toContain(
            '    funded drawdown $1,500 eod-trailing, locks at +$1,500 to breakeven or on 1st payout',
        );
    });

    it('shows the Apex EOD eval lock floor above breakeven and a separate funded line', () => {
        const lines = linesFor(apexEod);
        expect(lines[0]).toContain(
            'eval drawdown $2,000 eod-trailing, locks at +$5,000 to +$3,000',
        );
        expect(
            lines.some((line) => line.startsWith('    funded drawdown ')),
        ).toBe(true);
    });

    it('shows the MFF Pro eval profit lock and the funded lock that fires on the first payout (R1-51)', () => {
        const lines = linesFor(mffPro);
        expect(lines[0]).toContain(
            'eval drawdown $2,000 eod-trailing, locks at +$2,100 to +$100',
        );
        expect(lines).toContain(
            '    funded drawdown $2,000 eod-trailing, locks on first payout to +$100',
        );
    });

    it('shows the TopStep XFA floor reset on each payout', () => {
        expect(linesFor(topStepXfa)).toContain(
            '    funded drawdown $2,000 eod-trailing, locks at +$2,000 to breakeven, floor reset to breakeven on each payout',
        );
    });

    it('shows one drawdown segment for the instant-funded TopStep Pro Account', () => {
        const lines = linesFor(topStepPro);
        expect(lines[0]).toContain(
            'drawdown $2,000 eod-trailing, locks at +$2,000 to breakeven',
        );
        expect(lines.join('\n')).not.toContain('eval drawdown');
        expect(lines.join('\n')).not.toContain('funded drawdown');
    });

    it('shows the Alpha Futures Advanced $1,750 Evaluation and $2,000 Qualified drawdowns', () => {
        const lines = linesFor(alphaAdvanced);
        expect(lines[0]).toContain(
            'eval drawdown $1,750 eod-trailing, locks at +$1,750 to breakeven',
        );
        expect(lines).toContain(
            '    funded drawdown $2,000 eod-trailing, locks at +$2,000 to breakeven',
        );
    });

    it('prints a funded drawdown line on every plan exactly when the funded kind, amount, lock or payout floor effect differs', () => {
        const plans = planResolver.resolveMany({});
        expect(plans.length).toBeGreaterThan(30);
        for (const plan of plans) {
            const evalLock = plan.drawdown.lock;
            const fundedLock = plan.fundedDrawdown.lock;
            const isDifferent =
                !plan.isInstantFunded &&
                (plan.drawdown.kind !== plan.fundedDrawdown.kind ||
                    plan.drawdown.amount !== plan.fundedDrawdown.amount ||
                    evalLock?.atProfit !== fundedLock?.atProfit ||
                    evalLock?.lockedThreshold(plan.accountSize) !==
                        fundedLock?.lockedThreshold(plan.accountSize) ||
                    plan.payoutFloorEffect !== PayoutFloorEffect.None);
            expect(
                planRuleLines(plan).join('\n').includes('funded drawdown'),
                plan.label,
            ).toBe(isDifferent);
        }
    });
});

describe('planRuleLines: contract caps', () => {
    it('shows the E8 Signature funded micro cap as well as the minis', () => {
        expect(
            linesFor(signatureE8).some((line) =>
                line.includes('funded 4 mini / 40 micro'),
            ),
        ).toBe(true);
    });

    it('shows the E8 Zero tiered funded micro cap', () => {
        expect(
            linesFor(zeroMaxE8).some((line) =>
                line.includes(
                    'funded up to 5 mini (tiered) / up to 50 micro (tiered)',
                ),
            ),
        ).toBe(true);
    });

    it('keeps "funded unpublished" when a plan records eval caps but no funded caps', () => {
        const lines = linesFor({
            accountSize: 50_000,
            firm: FirmId.FundedNext,
            variant: FundedNextVariant.RapidDaily,
        });
        expect(
            lines.some((line) =>
                line.includes(
                    'contracts 4 mini / 40 micro | funded unpublished',
                ),
            ),
        ).toBe(true);
        expect(lines.some((line) => line.includes('? mini'))).toBe(false);
    });
});

describe('describePayoutSplit (R1-31)', () => {
    it('prints a single split as one percentage', () => {
        const split = new PayoutCountTieredPayoutSplit([singleSplit(0.9)]);
        expect(describePayoutSplit(split)).toBe('90%');
    });

    it('prints a payout-number schedule with 1-based payout ranges', () => {
        const split = new PayoutCountTieredPayoutSplit([
            singleSplit(0.7),
            splitStep(2, 0.8),
            splitStep(4, 0.9),
        ]);
        expect(describePayoutSplit(split)).toBe(
            '70% (payouts 1-2), 80% (payouts 3-4), 90% (payout 5+)',
        );
    });

    it('labels a one-payout step without a range', () => {
        const split = new PayoutCountTieredPayoutSplit([
            singleSplit(0.5),
            splitStep(1, 0.9),
        ]);
        expect(describePayoutSplit(split)).toBe(
            '50% (payout 1), 90% (payout 2+)',
        );
    });

    it('prints the Alpha Futures split and minimum request in the payout line', () => {
        const payoutLine = linesFor(alphaStandard).find((line) =>
            line.startsWith('    payout split'),
        );
        expect(payoutLine).toContain(
            'payout split 70% (payouts 1-2), 80% (payouts 3-4), 90% (payout 5+)',
        );
        expect(payoutLine).toContain('first $0 | min request $500');
    });
});

function payoutLineOf(planId: PlanId): string {
    const line = linesFor(planId).find((candidate) =>
        candidate.startsWith('    payout split'),
    );
    if (line === undefined) throw new Error('no payout line');
    return line;
}

describe('planRuleLines: per-cycle payout profit gate (N-42)', () => {
    it("shows FundedNext Legacy's $500 per-cycle gate next to its $0 first-payout gate", () => {
        expect(payoutLineOf(legacy)).toContain(
            'first $0 | per cycle $500 | min request $250',
        );
    });

    it('prints a sub-dollar per-cycle gate in cents instead of rounding it to $0', () => {
        const centGate = planFor(legacy).withOverrides({
            minPayoutProfitPerCycle: dollars(0.01),
        });

        expect(planRuleLines(centGate).join('\n')).toContain('per cycle $0.01');
    });

    it('prints no per-cycle segment for a plan with no per-cycle gate', () => {
        expect(payoutLineOf(alphaStandard)).not.toContain('per cycle');
    });
});
