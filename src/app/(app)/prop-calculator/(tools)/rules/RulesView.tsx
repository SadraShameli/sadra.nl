import { Fragment } from 'react';

import { ToolId } from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { ToolPageHeading } from '~/app/(app)/prop-calculator/_components/ToolPageHeading';
import { ToolSection } from '~/app/(app)/prop-calculator/_components/ToolSection';
import {
    ALL_FIRMS,
    type Plan,
    PLAN_AVAILABILITY_LABEL,
    serializePlanId,
    type TradingFirm,
} from '~/lib/prop-calculator';
import {
    describePlanRules,
    PLAN_RULE_SEGMENT_LABEL,
} from '~/lib/prop-calculator/describe';

export function RulesView() {
    return (
        <>
            <ToolPageHeading toolId={ToolId.Rules} />
            <div className="app-prop-calculator__rules mb-10 flex flex-col gap-10">
                {ALL_FIRMS.map((firm) => (
                    <FirmRules firm={firm} key={firm.id} />
                ))}
            </div>
        </>
    );
}

function FirmRules({ firm }: { firm: TradingFirm }) {
    return (
        <ToolSection id={`rules-${firm.id}`} title={firm.displayName}>
            <div className="grid gap-4 lg:grid-cols-2">
                {firm.plans.map((plan) => (
                    <PlanRules key={serializePlanId(plan.id)} plan={plan} />
                ))}
            </div>
        </ToolSection>
    );
}

function PlanRules({ plan }: { plan: Plan }) {
    return (
        <article className="flex flex-col gap-3 rounded-lg border border-white/10 p-4">
            <h3 className="text-base font-semibold text-white">
                {plan.label}
                {!plan.isPurchasable && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                        [{PLAN_AVAILABILITY_LABEL[plan.availability]}]
                    </span>
                )}
            </h3>
            <dl className="grid grid-cols-[minmax(0,12rem)_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
                {describePlanRules(plan)
                    .flat()
                    .map((segment) => (
                        <Fragment key={segment.kind}>
                            <dt className="text-muted-foreground">
                                {PLAN_RULE_SEGMENT_LABEL[segment.kind]}
                            </dt>
                            <dd className="text-white tabular-nums">
                                {segment.value}
                            </dd>
                        </Fragment>
                    ))}
            </dl>
        </article>
    );
}
