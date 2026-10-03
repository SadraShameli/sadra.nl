import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    DailyLossLimitKind,
    dollars,
    type DrawdownStrategy,
    fraction,
    LivePlan,
    resolveLiveAffordableRoom,
    StaticDrawdown,
    StrictlyBelowStaticDrawdown,
} from '~/lib/prop-calculator/core';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');
const CORE_SOURCE = 'src/lib/prop-calculator/core';
const ADVISOR_SOURCE = 'src/lib/prop-calculator/advisor';
const FLOOR_ALIVE_HOME = `${CORE_SOURCE}/LivePlan.ts`;
const SIZING_CUSHION_HOME = `${CORE_SOURCE}/LiveSizing.ts`;
const FLOOR_ALIVE_COPY = /liveDrawdown\s*!==\s*null\s*&&\s*!/;
const SIZING_CUSHION_COPY =
    /Math\.max\(\s*cushion\s*,\s*floorTradeRisk|cushion:\s*(?:context\.)?floorTradeRisk/;
const FLOOR_CENT_TOLERANCE_COPY =
    /isAtOrBelowWithinCentTolerance\(\s*(?:context\.)?cushion\s*,\s*0\s*\)/;
const FLOOR_CENT_TOLERANCE_HOME = `${CORE_SOURCE}/LiveSizing.ts`;

function filesMatching(files: readonly string[], pattern: RegExp): string[] {
    return files.filter((file) =>
        pattern.test(readFileSync(path.join(REPO_ROOT, file), 'utf8')),
    );
}

function floorPlan(drawdown: DrawdownStrategy | null): LivePlan {
    return new LivePlan({
        cushionPercent: { postLock: fraction(0.05), preLock: fraction(0.05) },
        label: 'Floor Live',
        liveDailyLossLimit:
            drawdown === null
                ? { amount: dollars(2000), kind: DailyLossLimitKind.Flat }
                : null,
        liveDrawdown: drawdown,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
        requiresLockForWithdrawal: false,
        startingBalance: dollars(10_000),
    });
}

function sourceFilesUnder(relativeDirectory: string): string[] {
    return readdirSync(path.join(REPO_ROOT, relativeDirectory), {
        recursive: true,
        withFileTypes: true,
    })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
        .map((entry) =>
            path
                .join(entry.parentPath, entry.name)
                .replace(`${REPO_ROOT}${path.sep}`, '')
                .split(path.sep)
                .join('/'),
        );
}

function stateAt(plan: LivePlan, balance: number) {
    const state = plan.initialState();
    state.balance = balance;
    return state;
}

describe('LivePlan.isFloorAlive is the one floor-alive check (WP62d, N-94)', () => {
    const strict = floorPlan(
        new StrictlyBelowStaticDrawdown({ amount: dollars(9000) }),
    );
    const plain = floorPlan(new StaticDrawdown({ amount: dollars(9000) }));
    const dailyLimitOnly = floorPlan(null);

    it('keeps a strictly-below floor alive exactly on the floor and busts it a cent under', () => {
        expect(strict.isFloorAlive(stateAt(strict, 1000))).toBe(true);
        expect(strict.isFloorAlive(stateAt(strict, 999.99))).toBe(false);
    });

    it('keeps a strictly-below floor alive above the floor', () => {
        expect(strict.isFloorAlive(strict.initialState())).toBe(true);
    });

    it('treats a plain floor as busted the moment the balance reaches it', () => {
        expect(plain.isFloorAlive(stateAt(plain, 1000))).toBe(false);
        expect(plain.isFloorAlive(stateAt(plain, 1000.01))).toBe(true);
    });

    it('has no floor to be alive on a plan with only a daily loss limit', () => {
        expect(
            dailyLimitOnly.isFloorAlive(stateAt(dailyLimitOnly, 10_000)),
        ).toBe(false);
        expect(dailyLimitOnly.isFloorAlive(stateAt(dailyLimitOnly, 0))).toBe(
            false,
        );
    });

    it('agrees with isBust wherever a drawdown exists', () => {
        for (const plan of [strict, plain]) {
            for (const balance of [900, 999.99, 1000, 1000.01, 5000]) {
                const state = stateAt(plan, balance);
                expect(plan.isFloorAlive(state)).toBe(!plan.isBust(state));
            }
        }
    });
});

describe('resolveLiveAffordableRoom lifts a cushion at the floor to the floor trade risk (WP62d)', () => {
    it('keeps a real cushion when the floor trade risk is zero', () => {
        expect(resolveLiveAffordableRoom(2000, null, 0, 0, 0).room).toBe(2000);
    });

    it('lifts a cushion of 0 to the one-contract floor trade risk', () => {
        expect(resolveLiveAffordableRoom(0, null, 0, 0, 450).room).toBe(450);
    });

    it('lifts a negative cushion to the floor trade risk too', () => {
        expect(resolveLiveAffordableRoom(-1e-10, null, 0, 0, 450).room).toBe(
            450,
        );
    });

    it('still bounds the lifted room by the daily loss room left', () => {
        expect(resolveLiveAffordableRoom(0, 2000, -1800, 0, 450).room).toBe(
            200,
        );
    });

    it('leaves the room at 0 for a cushion of 0 with no floor trade risk, the plain-floor case', () => {
        expect(resolveLiveAffordableRoom(0, null, 0, 0, 0).room).toBe(0);
    });
});

describe('the floor-alive check and the sizing cushion each have one copy (WP62d guard)', () => {
    const files = [
        ...sourceFilesUnder(CORE_SOURCE),
        ...sourceFilesUnder(ADVISOR_SOURCE),
    ];

    it('keeps the liveDrawdown-not-busted check only in LivePlan', () => {
        expect(filesMatching(files, FLOOR_ALIVE_COPY)).toStrictEqual([
            FLOOR_ALIVE_HOME,
        ]);
    });

    it('keeps the max of cushion and floor trade risk only in LiveSizing', () => {
        expect(filesMatching(files, SIZING_CUSHION_COPY)).toStrictEqual([
            SIZING_CUSHION_HOME,
        ]);
    });

    it('keeps the cushion-at-the-floor tolerance test only in LiveSizing', () => {
        expect(filesMatching(files, FLOOR_CENT_TOLERANCE_COPY)).toStrictEqual([
            FLOOR_CENT_TOLERANCE_HOME,
        ]);
    });
});
