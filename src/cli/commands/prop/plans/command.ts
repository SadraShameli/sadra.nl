import { defineCommand } from 'citty';

import {
    planArguments,
    planResolver,
    planVariant,
} from '~/cli/commands/prop/shared';
import { ui } from '~/cli/ui';
import {
    findFirm,
    type FirmId,
    type Plan,
    PLAN_AVAILABILITY_LABEL,
} from '~/lib/prop-calculator';
import {
    describePlanRules,
    formatPlanRuleLine,
} from '~/lib/prop-calculator/describe';

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
                ui.note(planHeadline(plan));
                for (const line of planRuleLines(plan)) {
                    ui.muted(line);
                }
            }
            ui.muted(`\n${plans.length} plan(s)`);
        } catch (error) {
            ui.fail(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
        }
    },
});

export function planHeadline(plan: Plan): string {
    const headline = `${plan.label}  --firm ${plan.id.firm} --variant ${planVariant(plan)}`;
    return plan.isPurchasable
        ? headline
        : `${headline}  [${PLAN_AVAILABILITY_LABEL[plan.availability]}]`;
}

export function planRuleLines(plan: Plan): string[] {
    return describePlanRules(plan).map(
        (line) => `    ${formatPlanRuleLine(line)}`,
    );
}
