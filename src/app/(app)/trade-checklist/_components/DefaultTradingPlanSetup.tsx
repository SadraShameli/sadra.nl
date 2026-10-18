'use client';

import { useEffect, useRef, useTransition } from 'react';

import { InfoNote } from '~/components/InfoNote';
import { createDefaultTradingPlan } from '~/lib/trading/actions';

export function DefaultTradingPlanSetup() {
    const [, startTransition] = useTransition();
    const requested = useRef(false);

    useEffect(() => {
        if (requested.current) return;
        requested.current = true;
        startTransition(async () => {
            await createDefaultTradingPlan();
        });
    }, []);

    return (
        <InfoNote
            aria-busy="true"
            className="app-trade-checklist__default-plan-setup"
            role="status"
        >
            Setting up your default trading plan.
        </InfoNote>
    );
}
