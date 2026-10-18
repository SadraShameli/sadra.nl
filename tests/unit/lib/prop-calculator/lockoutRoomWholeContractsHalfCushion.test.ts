import { describe, it } from 'vitest';

import {
    FirmId,
    FundedNextVariant,
    InstrumentSymbol,
} from '~/lib/prop-calculator/core';
import { simulate } from '~/lib/prop-calculator/simulator';

import {
    expectNqAtOrBelowMnq,
    HALF_CUSHION,
    halfCushionInWholeNqPolicy,
    LOCKOUT_DLL_CASES,
    planFor,
    stageDInputs,
} from './lockoutRoomFixtures';

describe('placing 50% of the cushion in coarser NQ contracts never beats MNQ asked for the same whole-NQ risk at the same 20 point stop on a lockout-DLL plan (N-74)', () => {
    it.each(
        LOCKOUT_DLL_CASES.filter(
            ({ id }) =>
                !(
                    id.firm === FirmId.FundedNext &&
                    id.variant === FundedNextVariant.RapidProDllAddOn
                ),
        ),
    )('$id.firm $id.variant', ({ evalLadder, id }) => {
        const plan = planFor(id);
        const base = {
            ...stageDInputs(plan, evalLadder, InstrumentSymbol.NQ),
            fundedRiskPerTrade: undefined,
        };
        expectNqAtOrBelowMnq(
            simulate({ ...base, fundedCushionPercent: HALF_CUSHION }),
            simulate({
                ...base,
                fundedDayPolicy: halfCushionInWholeNqPolicy(),
                instrument: InstrumentSymbol.MNQ,
            }),
        );
    });
});
