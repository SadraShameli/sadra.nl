'use client';

import { ArrowUpRight } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { startTransition, useCallback, useEffect, useRef } from 'react';

import { RowActionKind, rowActionsColumn } from '~/components/RowActionsMenu';
import { type DataTableColumn } from '~/components/ui/data-table';
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
import { simulatorHref } from './simulatorHref';
import {
    classifyToolLink,
    openInSimulatorActions,
    ToolLinkKind,
} from './toolNavigation';
import { type EncodeStateOptions } from './urlState';

export type OpenInSimulator = (firm: TradingFirm, plan: Plan) => void;

export function openInSimulatorColumn<Row extends { readonly plan: Plan }>(
    open: (row: Row) => void,
): DataTableColumn<Row> {
    return rowActionsColumn<Row>({
        actionsOf: (row) => [
            {
                icon: ArrowUpRight,
                kind: RowActionKind.Select,
                label: 'Open in the simulator',
                onSelect: () => open(row),
            },
        ],
        labelOf: (row) => row.plan.label,
    });
}

export function useOpenInSimulator(planOptIns: PlanOptIns): OpenInSimulator {
    const router = useRouter();
    const pathname = usePathname();
    const { applyState } = useCalculatorActions();
    const { encodeOptions, state } = useCalculatorInputs();
    const stateReference = useRef(state);
    const encodeOptionsReference = useRef<EncodeStateOptions>(encodeOptions);

    useEffect(() => {
        stateReference.current = state;
        encodeOptionsReference.current = encodeOptions;
    }, [encodeOptions, state]);

    return useCallback(
        (firm: TradingFirm, plan: Plan) => {
            const target = routes.propCalculator.simulator;
            const next = openInSimulatorActions(firm, plan, planOptIns).reduce(
                calculatorReducer,
                stateReference.current,
            );
            const href = simulatorHref(next, encodeOptionsReference.current);
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
