import Link from 'next/link';
import { useMemo } from 'react';

import { SimulationFailureNotice } from '~/app/(app)/prop-calculator/_components/SimulationFailureNotice';
import { overviewPlanOptInsOf } from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import {
    ACCOUNT_CALCULATOR_LINK_FLAG_TEXT,
    calculatorLinkForAccount,
} from '~/app/(app)/prop-calculator/accounts/_components/calculatorLinkForAccount';
import { Button } from '~/components/ui/Button';
import { type Dollars, type Plan, serializePlanId } from '~/lib/prop-calculator';
import {
    type RulebookParameters,
    type SizingStage,
} from '~/lib/prop-calculator/advisor';

export function SimulateAccountLink({
    personalMaxRiskPerTrade,
    plan,
    rulebook,
    rulebookError,
    stage,
}: {
    readonly personalMaxRiskPerTrade: Dollars | null;
    readonly plan: Plan;
    readonly rulebook: RulebookParameters | undefined;
    readonly rulebookError: null | string;
    readonly stage: SizingStage;
}) {
    const link = useMemo(
        () =>
            rulebook === undefined
                ? null
                : calculatorLinkForAccount({
                      firmId: plan.id.firm,
                      optIns: overviewPlanOptInsOf(plan),
                      personalMaxRiskPerTrade,
                      planSerial: serializePlanId(plan.id),
                      rulebook,
                      stage,
                  }),
        [personalMaxRiskPerTrade, plan, rulebook, stage],
    );
    if (rulebook === undefined) {
        return rulebookError === null ? (
            <p className="text-sm text-muted-foreground">
                Your rulebook has not loaded, so the simulator link is not ready
                yet.
            </p>
        ) : (
            <SimulationFailureNotice
                message={`Your rulebook could not be loaded, so the simulator link cannot be built: ${rulebookError}`}
            />
        );
    }
    if (link === null) {
        return (
            <p className="text-sm text-muted-foreground">
                The simulator cannot start from a live account.
            </p>
        );
    }
    return (
        <div className="flex flex-col gap-2">
            <div>
                <Button asChild variant="outline">
                    <Link href={link.href}>Simulate this account</Link>
                </Button>
            </div>
            <p className="text-xs text-muted-foreground">{link.label}</p>
            {link.flags.length > 0 && (
                <ul className="flex list-disc flex-col gap-1 pl-5 text-xs text-amber-400">
                    {link.flags.map((flag) => (
                        <li key={flag}>
                            {ACCOUNT_CALCULATOR_LINK_FLAG_TEXT[flag]}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
