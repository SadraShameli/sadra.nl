import PlanStatsBadges from '~/app/(app)/prop-calculator/_components/PlanStatsBadges';
import { LEDGER_ONLY_STATUS_NOTE } from '~/app/(app)/prop-calculator/accounts/_components/accountPlanOptions';
import { DisclosureTrigger } from '~/app/(app)/prop-calculator/accounts/_components/DisclosureTrigger';
import { DetailList, type DetailListItem } from '~/components/DetailList';
import { Collapsible, CollapsibleContent } from '~/components/ui/collapsible';
import { formatCurrency } from '~/lib/format';
import {
    describePlanOptIn,
    offeredPlanOptIns,
    planOptInField,
} from '~/lib/prop-accounts';
import { type Plan, type PlanOptIns } from '~/lib/prop-calculator';
import {
    describePlanRules,
    PLAN_RULE_SEGMENT_LABEL,
} from '~/lib/prop-calculator/describe';

const NO_LIMIT = 'None';

export function LedgerOnlyPlanSummary({
    accountSize,
    firmName,
    planLabel,
}: {
    readonly accountSize: number;
    readonly firmName: string;
    readonly planLabel: string;
}) {
    const items: readonly DetailListItem[] = [
        { id: 'plan', label: 'Plan', value: `${firmName} ${planLabel}` },
        {
            id: 'account-size',
            label: 'Account size',
            value: formatCurrency(accountSize),
        },
        { id: 'tracking', label: 'Tracking', value: 'Ledger only' },
    ];
    return (
        <div className="flex flex-col gap-4">
            <DetailList items={items} />
            <p className="text-sm text-muted-foreground">
                This plan is not modeled, so the engine never values this
                account: it shows no plan rules, projections or sizing advice
                here. Its fees and payouts still count in every cash, firm and
                funnel figure. Upgrade it to a modeled plan once its plan is
                modeled.
            </p>
            <p className="text-sm text-muted-foreground">
                {LEDGER_ONLY_STATUS_NOTE}
            </p>
        </div>
    );
}

export function PlanRulesSummary({
    firmName,
    optIns,
    plan,
}: {
    readonly firmName: string;
    readonly optIns: PlanOptIns;
    readonly plan: Plan;
}) {
    const takenOptIns = offeredPlanOptIns(plan).filter(
        (optIn) => optIns[planOptInField(optIn)],
    );
    const ruleItems: readonly DetailListItem[] = describePlanRules(
        plan,
    ).flatMap((line) =>
        line.map((segment): DetailListItem => ({
            id: segment.kind,
            label: PLAN_RULE_SEGMENT_LABEL[segment.kind],
            value: segment.value,
        })),
    );
    const items: readonly DetailListItem[] = [
        { id: 'plan', label: 'Plan', value: `${firmName} ${plan.label}` },
        {
            id: 'account-size',
            label: 'Account size',
            value: formatCurrency(plan.accountSize),
        },
        ...ruleItems,
        {
            id: 'rule-options-taken',
            label: 'Rule options taken',
            value:
                takenOptIns.length === 0
                    ? NO_LIMIT
                    : takenOptIns
                          .map((optIn) => describePlanOptIn(optIn))
                          .join(', '),
        },
    ];
    return (
        <div className="flex flex-col gap-4">
            <PlanStatsBadges plan={plan} />
            <Collapsible className="flex flex-col">
                <DisclosureTrigger>
                    All {items.length} plan rules
                </DisclosureTrigger>
                <CollapsibleContent>
                    <DetailList className="mt-3" items={items} />
                </CollapsibleContent>
            </Collapsible>
        </div>
    );
}
