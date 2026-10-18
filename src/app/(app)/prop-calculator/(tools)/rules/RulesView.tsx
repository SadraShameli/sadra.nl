import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { NO_EVAL_PHASE_REASON } from '~/app/(app)/prop-calculator/_components/missingReasons';
import { ToolId } from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { ToolPageHeading } from '~/app/(app)/prop-calculator/_components/ToolPageHeading';
import { ToolSection } from '~/app/(app)/prop-calculator/_components/ToolSection';
import { ValueOrMissing } from '~/app/(app)/prop-calculator/_components/ValueOrMissing';
import { DetailList } from '~/components/DetailList';
import { type PageTab, UrlPageTabs } from '~/components/PageTabs';
import { ToolPanel } from '~/components/ToolPanel';
import { Badge } from '~/components/ui/badge';
import {
    ALL_FIRMS,
    type FirmId,
    type Plan,
    PLAN_AVAILABILITY_LABEL,
    serializePlanId,
    type TradingFirm,
} from '~/lib/prop-calculator';
import {
    describePlanRules,
    PLAN_RULE_SEGMENT_LABEL,
} from '~/lib/prop-calculator/describe';

export enum RulesUrlParameter {
    Firm = 'rfirm',
}

const DEFAULT_RULES_FIRM_ID = defaultCalculatorState().firm.id;

export function RulesView() {
    const tabs: PageTab<FirmId>[] = ALL_FIRMS.map((firm) => ({
        content: <FirmRules firm={firm} />,
        label: firm.displayName,
        value: firm.id,
    }));
    return (
        <>
            <ToolPageHeading toolId={ToolId.Rules} />
            <UrlPageTabs
                className="app-prop-calculator__rules mb-10"
                defaultValue={DEFAULT_RULES_FIRM_ID}
                searchParameter={RulesUrlParameter.Firm}
                tabs={tabs}
            />
        </>
    );
}

function FirmRules({ firm }: { firm: TradingFirm }) {
    return (
        <ToolSection
            id={firmRulesSectionId(firm)}
            srOnlyHeading
            title={firm.displayName}
        >
            <div className="grid gap-4 lg:grid-cols-2 lg:[&>*:last-child:nth-child(odd)]:col-span-2">
                {firm.plans.map((plan) => (
                    <PlanRules key={serializePlanId(plan.id)} plan={plan} />
                ))}
            </div>
        </ToolSection>
    );
}

function firmRulesSectionId(firm: TradingFirm): `rules-${FirmId}` {
    return `rules-${firm.id}`;
}

function PlanRules({ plan }: { plan: Plan }) {
    return (
        <article>
            <ToolPanel
                className="h-full gap-4"
                title={
                    <span className="flex flex-wrap items-center gap-2">
                        {plan.label}
                        {!plan.isPurchasable && (
                            <Badge asChild>
                                <span>
                                    {PLAN_AVAILABILITY_LABEL[plan.availability]}
                                </span>
                            </Badge>
                        )}
                    </span>
                }
                titleAs="h3"
            >
                <DetailList
                    className="tabular-nums"
                    items={describePlanRules(plan)
                        .flat()
                        .map((segment) => ({
                            id: segment.kind,
                            label: PLAN_RULE_SEGMENT_LABEL[segment.kind],
                            value: (
                                <ValueOrMissing
                                    reason={NO_EVAL_PHASE_REASON}
                                    value={segment.value}
                                />
                            ),
                        }))}
                />
            </ToolPanel>
        </article>
    );
}
