import { mulberry32 } from './rng';
import { percentile } from './stats';

export interface CompoundInputs {
    winrate: number;
    rrRatio: number;
    tradesPerDay: number;
    riskFraction: number;
    tradingDays: number;
    trials: number;
    seed: number;
    startBalance: number;
}

export interface CompoundOutputs {
    days: number[];
    p5: number[];
    p25: number[];
    p50: number[];
    p75: number[];
    p95: number[];
    finalP5: number;
    finalP25: number;
    finalP50: number;
    finalP75: number;
    finalP95: number;
    daysToDouble: number | null;
    daysToTriple: number | null;
    ruinProb: number;
}

const STEP = 5;

export function simulateCompound(inputs: CompoundInputs): CompoundOutputs {
    const {
        winrate,
        rrRatio,
        tradesPerDay,
        riskFraction,
        tradingDays,
        trials,
        seed,
        startBalance,
    } = inputs;

    const rng = mulberry32(seed);
    const trades = Math.max(1, Math.round(tradesPerDay));
    const rf = Math.max(0, Math.min(riskFraction, 0.5));

    const stepCount = Math.ceil(tradingDays / STEP) + 1;
    const sampledPaths: Float64Array[] = Array.from(
        { length: trials },
        () => new Float64Array(stepCount),
    );

    const finalBalances: number[] = [];
    const daysToDoubleBuf: number[] = [];
    const daysToTripleBuf: number[] = [];
    let ruinCount = 0;

    for (let t = 0; t < trials; t++) {
        let bal = startBalance;
        let doubled = false;
        let tripled = false;
        const path = sampledPaths[t]!;
        path[0] = bal;
        let stepIdx = 1;

        for (let day = 1; day <= tradingDays; day++) {
            let dayPnl = 0;
            for (let tr = 0; tr < trades; tr++) {
                const risk = bal * rf;
                dayPnl += rng() < winrate ? risk * rrRatio : -risk;
            }
            bal = Math.max(0, bal + dayPnl);

            if (!doubled && bal >= startBalance * 2) {
                daysToDoubleBuf.push(day);
                doubled = true;
            }
            if (!tripled && bal >= startBalance * 3) {
                daysToTripleBuf.push(day);
                tripled = true;
            }

            if (day % STEP === 0 || day === tradingDays) {
                path[stepIdx++] = bal;
            }
        }

        finalBalances.push(bal);
        if (bal < startBalance * 0.1) ruinCount++;
    }

    const days: number[] = [0];
    const p5: number[] = [startBalance];
    const p25: number[] = [startBalance];
    const p50: number[] = [startBalance];
    const p75: number[] = [startBalance];
    const p95: number[] = [startBalance];

    const usedSteps = sampledPaths[0]?.length ?? 0;
    for (let si = 1; si < usedSteps; si++) {
        const vals = sampledPaths.map((p) => p[si] ?? 0);
        days.push(Math.min(si * STEP, tradingDays));
        p5.push(percentile(vals, 5));
        p25.push(percentile(vals, 25));
        p50.push(percentile(vals, 50));
        p75.push(percentile(vals, 75));
        p95.push(percentile(vals, 95));
    }

    const medianDays = (buf: number[]): number | null => {
        if (buf.length < trials * 0.5) return null;
        return percentile(buf, 50);
    };

    return {
        days,
        p5,
        p25,
        p50,
        p75,
        p95,
        finalP5: percentile(finalBalances, 5),
        finalP25: percentile(finalBalances, 25),
        finalP50: percentile(finalBalances, 50),
        finalP75: percentile(finalBalances, 75),
        finalP95: percentile(finalBalances, 95),
        daysToDouble: medianDays(daysToDoubleBuf),
        daysToTriple: medianDays(daysToTripleBuf),
        ruinProb: ruinCount / trials,
    };
}
