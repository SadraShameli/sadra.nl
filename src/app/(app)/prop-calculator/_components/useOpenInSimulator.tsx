'use client';

import { ArrowUpRight } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { startTransition, useCallback, useEffect, useRef } from 'react';

import { Button } from '~/components/ui/Button';
import { type DataTableColumn } from '~/components/ui/DataTable';
import {
    type Plan,
    type PlanOptIns,
    type TradingFirm,
} from '~/lib/prop-calculator';
import { routes } from '~/lib/site/routes';

import {
    useCalculatorActions,
    useCalculatorInputs,
} from './CalculatorProvider';
import { calculatorReducer } from './calculatorReducer';
import {
    classifyToolLink,
    openInSimulatorActions,
    ToolLinkKind,
} from './toolNavigation';
import { encodeState } from './urlState';

export type OpenInSimulator = (firm: TradingFirm, plan: Plan) => void;

export function openInSimulatorColumn<Row extends { readonly plan: Plan }>(
    open: (row: Row) => void,
): DataTableColumn<Row> {
    return {
        cell: ({ row }) => (
            <Button
                aria-label={`Open ${row.original.plan.label} in the simulator`}
                className="h-7 px-2 text-xs"
                onClick={() => open(row.original)}
                size="sm"
                variant="ghost"
            >
                Open
                <ArrowUpRight aria-hidden />
            </Button>
        ),
        enableSorting: false,
        header: '',
        id: 'openInSimulator',
    };
}

export function useOpenInSimulator(planOptIns: PlanOptIns): OpenInSimulator {
    const router = useRouter();
    const pathname = usePathname();
    const { applyState } = useCalculatorActions();
    const { state } = useCalculatorInputs();
    const stateReference = useRef(state);

    useEffect(() => {
        stateReference.current = state;
    }, [state]);

    return useCallback(
        (firm: TradingFirm, plan: Plan) => {
            const target = routes.propCalculator.simulator;
            const next = openInSimulatorActions(firm, plan, planOptIns).reduce(
                calculatorReducer,
                stateReference.current,
            );
            const href = `${target}?${encodeState(next).toString()}`;
            if (classifyToolLink(pathname, target) === ToolLinkKind.Boundary) {
                router.push(href);
                return;
            }
            startTransition(() => {
                applyState(next);
                router.push(href);
            });
        },
        [applyState, pathname, planOptIns, router],
    );
}
