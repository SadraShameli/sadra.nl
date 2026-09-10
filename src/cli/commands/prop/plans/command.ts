import { defineCommand } from 'citty';

import {
    describeDll,
    describeFundedMinis,
    describeShare,
    planArguments,
    planResolver,
    planVariant,
} from '~/cli/commands/prop/shared';
import { ui } from '~/cli/ui';
import { formatCurrency, formatPercent } from '~/lib/format';
import { findFirm, type FirmId } from '~/lib/prop-calculator';

export default defineCommand({
    args: {
        ...planArguments,
        variants: {
            default: false,
            description: 'Print only firm and variant, one per line',
            type: 'boolean',
        },
    },
    meta: {
        description:
            'Show the validated rule set for each plan. Filter with --firm and --variant.',
        name: 'plans',
    },
    run(context) {
        try {
            const plans = planResolver.resolveMany(context.args);

            if (context.args.variants) {
                for (const plan of plans) {
                    process.stdout.write(
                        `${plan.id.firm}\t${planVariant(plan)}\n`,
                    );
                }
                return;
            }

            let firm: FirmId | undefined;
            for (const plan of plans) {
                if (firm !== plan.id.firm) {
                    firm = plan.id.firm;
                    ui.heading(firm);
                    const firmNotes = findFirm(firm)?.notes ?? [];
                    for (const note of firmNotes) {
                        ui.warn(note);
                    }
                }
                const consistencyEval = plan.evalConsistencyRule();
                const consistencyFunded = plan.fundedConsistencyRule();
                const limits = plan.contractLimits;

                ui.note(
                    `${plan.label}  --firm ${plan.id.firm} --variant ${planVariant(plan)}`,
                );
                ui.muted(
                    [
                        `    target ${formatCurrency(plan.profitTarget)}`,
                        `drawdown ${formatCurrency(plan.drawdown.amount)} ${plan.drawdown.kind}`,
                        plan.drawdown.lock
                            ? `locks at +${formatCurrency(plan.drawdown.lock.atProfit)}`
                            : 'no lock',
                        `min days ${plan.minTradingDays}`,
                    ].join(' | '),
                );
                ui.muted(
                    [
                        `    eval DLL ${describeDll(plan.evalDailyLossLimit)}`,
                        `funded DLL ${describeDll(plan.fundedDailyLossLimit)}`,
                        `consistency eval ${describeShare(consistencyEval?.maxBestDayShare)}`,
                        `funded ${describeShare(consistencyFunded?.maxBestDayShare)}`,
                    ].join(' | '),
                );
                ui.muted(
                    [
                        `    contracts ${limits ? `${limits.evalMinis} mini / ${limits.evalMicros ?? '?'} micro` : 'not recorded'}`,
                        `funded ${describeFundedMinis(limits?.fundedMinis ?? null)}`,
                    ].join(' | '),
                );
                ui.muted(
                    [
                        `    fees eval ${formatCurrency(plan.fees.oneTimeEval)}`,
                        `activation ${formatCurrency(plan.fees.activation)}`,
                        `monthly ${formatCurrency(plan.fees.monthlySubscription)}`,
                        `reset ${formatCurrency(plan.fees.reset)}`,
                    ].join(' | '),
                );
                ui.muted(
                    [
                        `    payout split ${formatPercent(plan.payoutTiers[0]?.traderShare ?? 0, 0)}`,
                        `first ${formatCurrency(plan.minPayoutProfit)}`,
                        `min request ${formatCurrency(plan.minPayoutRequest)}`,
                        `qualifying days ${plan.minDaysAfterPassForPayout}`,
                        plan.minQualifyingDayProfit === null
                            ? 'any day counts'
                            : `winning day >= ${formatCurrency(plan.minQualifyingDayProfit)}`,
                    ].join(' | '),
                );
                if (plan.payoutBuffer !== null) {
                    ui.muted(
                        `    payout buffer: EOD balance must clear ${formatCurrency(
                            plan.payoutBuffer.requiredBalance(
                                plan.accountSize,
                                plan.fundedDrawdown.amount,
                            ),
                        )}`,
                    );
                }
                if (plan.payoutRequestCap !== null) {
                    ui.muted(
                        `    per-request cap ${formatCurrency(plan.payoutRequestCap)}`,
                    );
                }
                if (plan.payoutLadder) {
                    ui.muted(
                        `    payout ladder [${plan.payoutLadder.steps.join(', ')}] min request ${formatCurrency(plan.payoutLadder.minRequestAmount)}`,
                    );
                }
                if (plan.payoutProfitShare !== null) {
                    ui.muted(
                        `    per-request cap ${formatPercent(plan.payoutProfitShare, 0)} of cycle profit`,
                    );
                }
            }
            ui.muted(`\n${plans.length} plan(s)`);
        } catch (error) {
            ui.fail(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
        }
    },
});
