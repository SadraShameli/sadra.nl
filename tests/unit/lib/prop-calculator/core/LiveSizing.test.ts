import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    AffordableRoomKind,
    capRiskToRemainingDailyLoss,
    DailyLossLimitBreachEffect,
    type DailyLossRoom,
    floorToWholeCents,
    fraction,
    ONE_CENT,
    resolveAffordableRisk,
    resolveAffordableRoom,
    resolveAffordableRoomWithin,
    resolveDailyLossRoom,
    resolveLiveAffordableRoom,
    resolveLiveFloorTradeRisk,
    resolveLiveTradeRisk,
} from '~/lib/prop-calculator/core';

describe('resolveLiveFloorTradeRisk', () => {
    it('places the one-contract risk when the cushion is exactly 0 and the floor is still alive', () => {
        expect(resolveLiveFloorTradeRisk(0, true, 450)).toBe(450);
    });

    it('places the one-contract risk through float residue under a cent either side of 0', () => {
        expect(resolveLiveFloorTradeRisk(1e-10, true, 450)).toBe(450);
        expect(resolveLiveFloorTradeRisk(-1e-10, true, 450)).toBe(450);
    });

    it('places nothing once the floor is not alive', () => {
        expect(resolveLiveFloorTradeRisk(0, false, 450)).toBe(0);
        expect(resolveLiveFloorTradeRisk(-500, false, 450)).toBe(0);
    });

    it('places nothing when the cushion is a real positive amount, leaving the cushion percent in charge', () => {
        expect(resolveLiveFloorTradeRisk(0.01, true, 450)).toBe(0);
        expect(resolveLiveFloorTradeRisk(3000, true, 450)).toBe(0);
    });

    it('never places a negative risk', () => {
        expect(resolveLiveFloorTradeRisk(0, true, -450)).toBe(0);
    });
});

describe('resolveLiveTradeRisk', () => {
    it('risks zero once the cushion is exactly exhausted', () => {
        expect(resolveLiveTradeRisk(0, fraction(0.05))).toBe(0);
    });

    it('never risks a positive amount when underwater (cushion negative)', () => {
        expect(resolveLiveTradeRisk(-500, fraction(0.05))).toBe(0);
    });

    it("sizes to Apex's confirmed 5% pre-lock rate: $3,000 cushion -> $150 risk", () => {
        expect(resolveLiveTradeRisk(3000, fraction(0.05))).toBeCloseTo(150, 10);
    });

    it("sizes to Apex's confirmed 10% post-lock rate: the same $3,000 cushion doubles to $300 risk once locked", () => {
        const preLockRisk = resolveLiveTradeRisk(3000, fraction(0.05));
        const postLockRisk = resolveLiveTradeRisk(3000, fraction(0.1));

        expect(postLockRisk).toBeCloseTo(300, 10);
        expect(postLockRisk).toBeCloseTo(preLockRisk * 2, 10);
    });

    it('scales linearly with the cushion for a fixed percentage', () => {
        const small = resolveLiveTradeRisk(1000, fraction(0.05));
        const large = resolveLiveTradeRisk(2000, fraction(0.05));

        expect(large).toBeCloseTo(small * 2, 10);
    });
});

describe('capRiskToRemainingDailyLoss (R-3: no trade loses more than the remaining daily loss limit)', () => {
    it('leaves the risk alone on a plan with no daily loss limit', () => {
        expect(capRiskToRemainingDailyLoss(3050, null, -1900, 30)).toBe(3050);
    });

    it('leaves a risk inside the remaining limit alone', () => {
        expect(capRiskToRemainingDailyLoss(450, 2000, 0, 0)).toBe(450);
    });

    it('cuts a $729 risk to the $290 left of a $500 limit after a $210 loss today', () => {
        expect(capRiskToRemainingDailyLoss(729, 500, -210, 0)).toBe(290);
    });

    it("counts today's gains toward the room left, like the funded engine", () => {
        expect(capRiskToRemainingDailyLoss(900, 500, 150, 0)).toBe(650);
    });

    it('leaves room for the commission, so risk plus commission never exceeds what is left', () => {
        expect(capRiskToRemainingDailyLoss(900, 500, -267, 30)).toBe(203);
    });

    it('risks nothing once less than one cent of room is left after the commission', () => {
        expect(capRiskToRemainingDailyLoss(900, 500, -469.995, 30)).toBe(0);
        expect(capRiskToRemainingDailyLoss(900, 500, -500, 0)).toBe(0);
        expect(capRiskToRemainingDailyLoss(900, 500, -600, 0)).toBe(0);
        expect(capRiskToRemainingDailyLoss(900, 500, -480, 30)).toBe(0);
    });

    it('keeps a sub-cent risk when the limit has room for it, so the cushion floor alone decides', () => {
        expect(capRiskToRemainingDailyLoss(0.004, 500, -100, 0)).toBe(0.004);
    });

    it('refuses even a sub-cent risk once the room left is under one cent', () => {
        expect(capRiskToRemainingDailyLoss(0.004, 500, -499.992, 0)).toBe(0);
    });

    it('matches the funded resolveAffordableRisk rule when there is no commission', () => {
        for (const [risk, limit, todayPnL] of [
            [729, 500, -210],
            [100, 500, -210],
            [900, 2000, 400],
        ] as const) {
            expect(capRiskToRemainingDailyLoss(risk, limit, todayPnL, 0)).toBe(
                resolveAffordableRisk(risk, limit, todayPnL, 0),
            );
        }
    });
});

describe('resolveLiveAffordableRoom resolves the live room once, never below zero once the daily loss room is gone (WP39f)', () => {
    it.each([
        {
            args: [2000, null, -300, 5],
            expected: { kind: AffordableRoomKind.BustsAccount, room: 2000 },
            name: 'no daily loss limit: the whole cushion, which busts',
        },
        {
            args: [-50, null, 0, 0],
            expected: { kind: AffordableRoomKind.BustsAccount, room: -50 },
            name: 'no daily loss limit and an underwater cushion: the cushion as is',
        },
        {
            args: [2000, 1000, -300, 5],
            expected: { kind: AffordableRoomKind.LocksDay, room: 695 },
            name: 'a daily loss room net of commission below the cushion locks the day',
        },
        {
            args: [500, 1000, 0, 0],
            expected: { kind: AffordableRoomKind.BustsAccount, room: 500 },
            name: 'a cushion below the daily loss room busts',
        },
        {
            args: [2000, 1000, -1200, 0],
            expected: { kind: AffordableRoomKind.LocksDay, room: 0 },
            name: 'a day already $200 past the limit: zero room, not -$200',
        },
        {
            args: [-50, 1000, -1000, 0],
            expected: { kind: AffordableRoomKind.BustsAccount, room: 0 },
            name: 'a spent daily loss room with an underwater cushion: zero room',
        },
        {
            args: [-50, 1000, -300, 0],
            expected: { kind: AffordableRoomKind.BustsAccount, room: -50 },
            name: 'an underwater cushion with daily loss room left: the cushion as is',
        },
        {
            args: [2000, 500, -499.995, 0],
            expected: { kind: AffordableRoomKind.LocksDay, room: 0 },
            name: 'under one cent of daily loss room left: zero room',
        },
        {
            args: [695 + 1e-9, 1000, -300, 5],
            expected: { kind: AffordableRoomKind.BustsAccount, room: 695 },
            name: 'a cushion level with the daily loss room within the cent tolerance busts',
        },
    ] as const)('$name', ({ args, expected }) => {
        const [cushion, limit, todayPnL, commission] = args;
        expect(
            resolveLiveAffordableRoom(cushion, limit, todayPnL, commission),
        ).toStrictEqual(expected);
    });

    it('carries the room capRiskToRemainingDailyLoss allows for the whole cushion', () => {
        for (const [cushion, limit, todayPnL, commission] of [
            [2000, 1000, -300, 5],
            [2000, 1000, -1200, 0],
            [-50, 1000, -1000, 0],
            [-50, 1000, -300, 0],
            [3050, null, -1900, 30],
        ] as const) {
            expect(
                resolveLiveAffordableRoom(cushion, limit, todayPnL, commission)
                    .room,
            ).toBe(
                capRiskToRemainingDailyLoss(
                    cushion,
                    limit,
                    todayPnL,
                    commission,
                ),
            );
        }
    });
});

describe('resolveAffordableRoomWithin only takes a daily loss room resolveDailyLossRoom made, from the core barrel (WP39f)', () => {
    it('brands the daily loss room so a raw number cannot skip the cent tolerance clamp', () => {
        expectTypeOf(
            resolveDailyLossRoom,
        ).returns.toEqualTypeOf<DailyLossRoom>();
        expectTypeOf(resolveAffordableRoomWithin)
            .parameter(1)
            .toEqualTypeOf<DailyLossRoom>();
        expectTypeOf<number>().not.toExtend<DailyLossRoom>();
    });

    it.each([
        [null, -300, 5, Infinity],
        [1000, -300, 5, 695],
        [500, -499.995, 0, 0],
        [1000, -1200, 0, -200],
    ] as const)(
        'resolves limit %s, today %s, commission %s to a daily loss room of %s',
        (limit, todayPnL, commission, expected) => {
            expect(resolveDailyLossRoom(limit, todayPnL, commission)).toBe(
                expected,
            );
        },
    );

    it.each([
        [2000, 1000, -300, 5],
        [500, 1000, 0, 0],
        [2000, 500, -499.995, 0],
        [695 + 1e-9, 1000, -300, 5],
        [2000, null, -300, 5],
    ] as const)(
        'matches resolveAffordableRoom for cushion %s, limit %s, today %s, commission %s under either breach effect',
        (cushion, limit, todayPnL, commission) => {
            for (const breach of Object.values(DailyLossLimitBreachEffect)) {
                expect(
                    resolveAffordableRoomWithin(
                        cushion,
                        resolveDailyLossRoom(limit, todayPnL, commission),
                        breach,
                    ),
                ).toStrictEqual(
                    resolveAffordableRoom(
                        cushion,
                        limit,
                        todayPnL,
                        commission,
                        breach,
                    ),
                );
            }
        },
    );
});

describe('ONE_CENT lives with the branded unit helpers (WP18g)', () => {
    it('is one cent in dollars, exported from the core barrel', () => {
        expect(ONE_CENT).toBe(0.01);
    });

    it('is the room below which the per-trade cap refuses a trade', () => {
        expect(
            capRiskToRemainingDailyLoss(900, 500, -500 + 2 * ONE_CENT, 0),
        ).toBeCloseTo(2 * ONE_CENT, 10);
        expect(
            capRiskToRemainingDailyLoss(900, 500, -500 + ONE_CENT / 2, 0),
        ).toBe(0);
    });
});

describe('floorToWholeCents reads an amount in whole cents (WP18g review)', () => {
    it('drops a sub-cent leftover: 10,000.004 and 10,000.009 both read as 10,000.00', () => {
        expect(floorToWholeCents(10_000.004)).toBe(10_000);
        expect(floorToWholeCents(10_000.009)).toBe(10_000);
    });

    it('keeps a whole cent that floating point stores a hair low: 65,000.01 minus 55,000 reads as 10,000.01', () => {
        expect(floorToWholeCents(65_000.01 - 55_000)).toBe(10_000.01);
    });

    it('floors a negative amount toward the lower cent', () => {
        expect(floorToWholeCents(-0.004)).toBe(-0.01);
    });
});
