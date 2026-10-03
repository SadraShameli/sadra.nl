'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

import {
    type BankrollViewState,
    decodeBankrollViewState,
} from '~/app/(app)/prop-calculator/_components/bankroll/bankrollUrlState';
import { BatchCard } from '~/app/(app)/prop-calculator/_components/bankroll/BatchCard';
import { LeversCard } from '~/app/(app)/prop-calculator/_components/bankroll/LeversCard';
import { ProjectionCard } from '~/app/(app)/prop-calculator/_components/bankroll/ProjectionCard';
import { RulebookSourceNotice } from '~/app/(app)/prop-calculator/_components/bankroll/RulebookSourceNotice';
import { SameEvCard } from '~/app/(app)/prop-calculator/_components/bankroll/SameEvCard';
import { SetupCard } from '~/app/(app)/prop-calculator/_components/bankroll/SetupCard';
import { SpendPayoutCurveCard } from '~/app/(app)/prop-calculator/_components/bankroll/SpendPayoutCurveCard';
import { TwoStrategiesCard } from '~/app/(app)/prop-calculator/_components/bankroll/TwoStrategiesCard';
import { useBankrollVariant } from '~/app/(app)/prop-calculator/_components/bankroll/useBankrollVariant';
import { InputsSummary } from '~/app/(app)/prop-calculator/_components/InputsSummary';
import { ToolId } from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { ToolPageHeading } from '~/app/(app)/prop-calculator/_components/ToolPageHeading';

export function BankrollView() {
    const searchParameters = useSearchParams();
    const { rulebookSource } = useBankrollVariant();
    const [state, setState] = useState<BankrollViewState>(() =>
        decodeBankrollViewState(
            new URLSearchParams(searchParameters.toString()),
        ),
    );

    const change = (patch: Partial<BankrollViewState>): void => {
        setState((current) => ({ ...current, ...patch }));
    };

    return (
        <>
            <ToolPageHeading toolId={ToolId.Bankroll} />
            <div className="mb-10 flex flex-col gap-8">
                <InputsSummary />
                <RulebookSourceNotice source={rulebookSource} />
                <SetupCard onChange={change} state={state} />
                <ProjectionCard onChange={change} state={state} />
                <TwoStrategiesCard onChange={change} state={state} />
                <BatchCard />
                <SameEvCard />
                <LeversCard />
                <SpendPayoutCurveCard />
            </div>
        </>
    );
}
