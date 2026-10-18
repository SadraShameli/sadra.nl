import { CENTS_PER_DOLLAR } from './lib/units';

export enum EvalTradeOutcomeKind {
    Decide = 'decide',
    Fail = 'fail',
    Stop = 'stop',
}

export interface EvalDayRules {
    readonly candidateRisks: (
        cushion: number,
        pnl: number,
    ) => readonly number[];
    readonly commission: number;
    readonly outcomeAfterTrade: (
        trade: EvalTradeResult,
    ) => EvalTradeOutcomeKind;
    readonly rrRatio: number;
    readonly slots: number;
}

export interface EvalTradeResult {
    readonly cushion: number;
    readonly hasWon: boolean;
    readonly nextTradeIndex: number;
    readonly pnl: number;
    readonly pnlDelta: number;
}

const FAIL_REF = -1;
const FIRST_STOP_REF = -2;
const NO_OUTCOME = -2_147_483_648;

class EvalDayTopologyBuilder {
    private readonly candidateStarts: number[] = [0];
    private readonly decisionIndexByTrade: Map<number, number>[];
    private readonly loseRefs: number[] = [];
    private readonly stopCushions: number[] = [];
    private readonly stopIndexByKey = new Map<number, number>();
    private readonly stopPnls: number[] = [];
    private readonly stopWasIdle: number[] = [];
    private readonly winRefs: number[] = [];

    constructor(private readonly rules: EvalDayRules) {
        this.decisionIndexByTrade = Array.from(
            { length: rules.slots },
            () => new Map<number, number>(),
        );
    }

    private outcomeRef(
        cushion: number,
        pnl: number,
        pnlDelta: number,
        hasWon: boolean,
        nextTradeIndex: number,
    ): number {
        if (cushion <= 0) return FAIL_REF;
        switch (
            this.rules.outcomeAfterTrade({
                cushion,
                hasWon,
                nextTradeIndex,
                pnl,
                pnlDelta,
            })
        ) {
            case EvalTradeOutcomeKind.Decide: {
                return this.addDecision(nextTradeIndex, cushion, pnl);
            }
            case EvalTradeOutcomeKind.Fail: {
                return FAIL_REF;
            }
            case EvalTradeOutcomeKind.Stop: {
                return this.stopRef(cushion, pnl, false);
            }
        }
    }

    private stopRef(cushion: number, pnl: number, wasIdle: boolean): number {
        const key = centsOf(cushion) * 2 + (wasIdle ? 1 : 0);
        const known = this.stopIndexByKey.get(key);
        if (known !== undefined) return FIRST_STOP_REF - known;
        const index = this.stopCushions.length;
        this.stopIndexByKey.set(key, index);
        this.stopCushions.push(cushion);
        this.stopPnls.push(pnl);
        this.stopWasIdle.push(wasIdle ? 1 : 0);
        return FIRST_STOP_REF - index;
    }

    addDecision(tradeIndex: number, cushion: number, pnl: number): number {
        const memo = this.decisionIndexByTrade[tradeIndex];
        if (memo === undefined) {
            throw new RangeError(
                `EvalDayTopology: trade index ${tradeIndex} is outside the ${this.rules.slots} trade day`,
            );
        }
        const key = centsOf(cushion);
        const known = memo.get(key);
        if (known !== undefined) return known;
        const { commission, rrRatio } = this.rules;
        const winRefs: number[] = [];
        const loseRefs: number[] = [];
        for (const risk of this.rules.candidateRisks(cushion, pnl)) {
            if (risk <= 0) {
                winRefs.push(this.stopRef(cushion, pnl, tradeIndex === 0));
                loseRefs.push(NO_OUTCOME);
                continue;
            }
            const pnlWin = rrRatio * risk - commission;
            winRefs.push(
                this.outcomeRef(
                    cushion + pnlWin,
                    pnl + pnlWin,
                    pnlWin,
                    true,
                    tradeIndex + 1,
                ),
            );
            const pnlLose = -risk - commission;
            loseRefs.push(
                this.outcomeRef(
                    cushion + pnlLose,
                    pnl + pnlLose,
                    pnlLose,
                    false,
                    tradeIndex + 1,
                ),
            );
        }
        const index = this.candidateStarts.length - 1;
        this.winRefs.push(...winRefs);
        this.loseRefs.push(...loseRefs);
        this.candidateStarts.push(this.winRefs.length);
        memo.set(key, index);
        return index;
    }

    finish(): EvalDayTopology {
        return new EvalDayTopology(
            Int32Array.from(this.candidateStarts),
            Int32Array.from(this.loseRefs),
            Int32Array.from(this.winRefs),
            Float64Array.from(this.stopCushions),
            Float64Array.from(this.stopPnls),
            Uint8Array.from(this.stopWasIdle),
        );
    }
}

export class EvalDayTopology {
    static build(startCushion: number, rules: EvalDayRules): EvalDayTopology {
        const builder = new EvalDayTopologyBuilder(rules);
        builder.addDecision(0, startCushion, 0);
        return builder.finish();
    }

    constructor(
        private readonly candidateStarts: Int32Array,
        private readonly loseRefs: Int32Array,
        private readonly winRefs: Int32Array,
        readonly stopCushions: Float64Array,
        readonly stopPnls: Float64Array,
        readonly stopWasIdle: Uint8Array,
    ) {}

    get nodeCount(): number {
        return this.candidateStarts.length - 1;
    }

    get stopCount(): number {
        return this.stopCushions.length;
    }

    evaluate(
        stopValues: Float64Array,
        failValue: number,
        winrate: number,
        nodeValues: Float64Array,
    ): number {
        const { candidateStarts, loseRefs, winRefs } = this;
        const nodeCount = candidateStarts.length - 1;
        for (let node = 0; node < nodeCount; node++) {
            let best = -Infinity;
            const end = candidateStarts[node + 1] ?? 0;
            for (let at = candidateStarts[node] ?? 0; at < end; at++) {
                const winRef = winRefs[at] ?? FAIL_REF;
                const loseRef = loseRefs[at] ?? NO_OUTCOME;
                const winValue =
                    winRef >= 0
                        ? (nodeValues[winRef] ?? 0)
                        : winRef === FAIL_REF
                          ? failValue
                          : (stopValues[FIRST_STOP_REF - winRef] ?? 0);
                let value = winValue;
                if (loseRef !== NO_OUTCOME) {
                    const loseValue =
                        loseRef >= 0
                            ? (nodeValues[loseRef] ?? 0)
                            : loseRef === FAIL_REF
                              ? failValue
                              : (stopValues[FIRST_STOP_REF - loseRef] ?? 0);
                    value = winrate * winValue + (1 - winrate) * loseValue;
                }
                if (value <= best) continue;
                best = value;
            }
            nodeValues[node] = best;
        }
        return nodeValues[nodeCount - 1] ?? NaN;
    }
}

export function centsOf(dollarAmount: number): number {
    return Math.round(dollarAmount * CENTS_PER_DOLLAR);
}
