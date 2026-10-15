'use client';

import { useEffect, useRef, useTransition } from 'react';

import { Card, CardContent } from '~/components/ui/Card';
import { createDefaultTradingPlan } from '~/lib/trading/actions';
import { cn } from '~/lib/utilities';

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
        <Card
            aria-busy="true"
            className={cn(
                'app-trade-checklist__default-plan-setup',
                'max-w-2xl',
            )}
        >
            <CardContent>
                <p className="text-sm text-muted-foreground" role="status">
                    Setting up your default trading plan.
                </p>
            </CardContent>
        </Card>
    );
}
