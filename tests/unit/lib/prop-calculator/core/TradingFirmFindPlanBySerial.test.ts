import { describe, expect, it } from 'vitest';

import { ALL_FIRMS, serializePlanId } from '~/lib/prop-calculator';

describe('TradingFirm.findPlanBySerial', () => {
    it('returns the registry plan itself for every serial of every firm', () => {
        let checked = 0;
        for (const firm of ALL_FIRMS) {
            for (const plan of firm.plans) {
                expect(firm.findPlanBySerial(serializePlanId(plan.id))).toBe(
                    plan,
                );
                checked += 1;
            }
        }
        expect(checked).toBeGreaterThan(ALL_FIRMS.length);
    });

    it('returns null for an unknown serial', () => {
        for (const firm of ALL_FIRMS) {
            expect(firm.findPlanBySerial('nope')).toBeNull();
            expect(firm.findPlanBySerial('')).toBeNull();
        }
    });

    it('returns null for a serial that belongs to another firm', () => {
        for (const firm of ALL_FIRMS) {
            for (const other of ALL_FIRMS) {
                if (other.id === firm.id) continue;
                for (const plan of other.plans) {
                    expect(
                        firm.findPlanBySerial(serializePlanId(plan.id)),
                    ).toBeNull();
                }
            }
        }
    });
});
