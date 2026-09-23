import type { ArgsDef } from 'citty';

import { parseArgs } from 'citty';
import { describe, expect, it } from 'vitest';

import {
    planArguments,
    planResolver,
    readRebuyLagDays,
    tradingArguments,
    TradingInputs,
} from '~/cli/commands/prop/shared';
import { FirmId } from '~/lib/prop-calculator';

const ARGS = { ...planArguments, ...tradingArguments } satisfies ArgsDef;

function registryPlan() {
    return planResolver.resolveOne({ firm: FirmId.Mffu, variant: 'rapid-eod' });
}

describe('--rebuy-lag-days', () => {
    it('threads a parsed value through TradingInputs into SimInputs', () => {
        const parsed = parseArgs<typeof ARGS>(['--rebuy-lag-days', '2'], ARGS);
        const inputs = TradingInputs.parse(parsed);
        const simInputs = inputs.toSimInputs(registryPlan());
        expect(simInputs.rebuyLagDays).toBe(2);
    });

    it('defaults to 0 when the flag is omitted', () => {
        const parsed = parseArgs<typeof ARGS>([], ARGS);
        const inputs = TradingInputs.parse(parsed);
        const simInputs = inputs.toSimInputs(registryPlan());
        expect(simInputs.rebuyLagDays).toBe(0);
    });

    it('rejects a negative value, naming the flag', () => {
        expect(() => readRebuyLagDays('-1')).toThrow(/--rebuy-lag-days/);
    });

    it('rejects a non-numeric value, naming the flag', () => {
        expect(() => readRebuyLagDays('abc')).toThrow(/--rebuy-lag-days/);
    });
});
