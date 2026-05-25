import type { ProgressionRuleKind } from '~/lib/lifting/types';

export interface CompletedSet {
    completed: boolean;
    reps: number;
    rpe?: number;
    targetReps?: number;
    weightKg: number;
}

export interface DoubleProgressionConfig {
    incrementKg: number;
    maxReps: number;
    minReps: number;
}

export interface LinearProgressionConfig {
    incrementKg: number;
    minReps: number;
    targetReps: number;
}

export interface PercentageProgressionConfig {
    oneRepMaxKg: number;
    pct1rm: number;
    targetReps: number;
}

export interface ProgressionSuggestion {
    rationale: string;
    reps: number;
    weightKg: number;
}

export interface RpeTargetProgressionConfig {
    targetReps: number;
    targetRpe: number;
}

export interface SessionSummary {
    allCompleted: boolean;
    sets: CompletedSet[];
}

export abstract class ProgressionRule {
    abstract readonly id: ProgressionRuleKind;
    abstract readonly label: string;
    abstract suggest(history: SessionSummary[]): ProgressionSuggestion;
}

export class DoubleProgression extends ProgressionRule {
    readonly id = 'double' as const;
    readonly label = 'Double progression';

    constructor(private readonly config: DoubleProgressionConfig) {
        super();
    }

    suggest(history: SessionSummary[]): ProgressionSuggestion {
        const last = history.at(-1);
        if (!last || last.sets.length === 0) {
            return {
                rationale: 'No history.',
                reps: this.config.minReps,
                weightKg: 0,
            };
        }
        const topSet = last.sets
            .filter((s) => s.completed)
            .reduce<CompletedSet | null>((best, s) => {
                if (!best) return s;
                if (
                    s.weightKg > best.weightKg ||
                    (s.weightKg === best.weightKg && s.reps > best.reps)
                ) {
                    return s;
                }
                return best;
            }, null);
        if (!topSet) {
            return {
                rationale: 'No completed sets.',
                reps: this.config.minReps,
                weightKg: 0,
            };
        }
        if (topSet.reps >= this.config.maxReps) {
            return {
                rationale: `Hit top of rep range — bump weight by ${this.config.incrementKg} kg.`,
                reps: this.config.minReps,
                weightKg: topSet.weightKg + this.config.incrementKg,
            };
        }
        return {
            rationale: 'Add a rep at the same weight.',
            reps: Math.min(topSet.reps + 1, this.config.maxReps),
            weightKg: topSet.weightKg,
        };
    }
}

export class LinearProgression extends ProgressionRule {
    readonly id = 'linear' as const;
    readonly label = 'Linear';

    constructor(private readonly config: LinearProgressionConfig) {
        super();
    }

    private static heaviestSet(session: SessionSummary): CompletedSet | null {
        return (
            session.sets
                .filter((s) => s.completed)
                .reduce<CompletedSet | null>((best, s) => {
                    if (!best || s.weightKg > best.weightKg) return s;
                    return best;
                }, null) ?? null
        );
    }

    suggest(history: SessionSummary[]): ProgressionSuggestion {
        const last = history.at(-1);
        if (!last || last.sets.length === 0) {
            return {
                rationale: 'No history. Start light and build.',
                reps: this.config.targetReps,
                weightKg: 0,
            };
        }
        const baseline = LinearProgression.heaviestSet(last);
        if (!baseline) {
            return {
                rationale: 'No completed sets last session.',
                reps: this.config.targetReps,
                weightKg: 0,
            };
        }
        if (last.allCompleted) {
            return {
                rationale: `Cleared all sets last session — add ${this.config.incrementKg} kg.`,
                reps: this.config.targetReps,
                weightKg: baseline.weightKg + this.config.incrementKg,
            };
        }
        return {
            rationale: 'Missed reps last session — repeat the same weight.',
            reps: this.config.targetReps,
            weightKg: baseline.weightKg,
        };
    }
}

export class PercentageProgression extends ProgressionRule {
    static readonly MAX_PCT_1RM = 150;
    static readonly MIN_PCT_1RM = 0;

    readonly id = 'percentage' as const;
    readonly label = 'Percentage of 1RM';

    constructor(private readonly config: PercentageProgressionConfig) {
        super();
        if (
            !Number.isFinite(config.pct1rm) ||
            config.pct1rm < PercentageProgression.MIN_PCT_1RM ||
            config.pct1rm > PercentageProgression.MAX_PCT_1RM
        ) {
            throw new RangeError(
                `pct1rm must be between ${PercentageProgression.MIN_PCT_1RM} and ${PercentageProgression.MAX_PCT_1RM}, got ${config.pct1rm}`,
            );
        }
        if (!Number.isFinite(config.oneRepMaxKg) || config.oneRepMaxKg < 0) {
            throw new RangeError(
                `oneRepMaxKg must be non-negative, got ${config.oneRepMaxKg}`,
            );
        }
    }

    suggest(): ProgressionSuggestion {
        const weightKg = this.config.oneRepMaxKg * (this.config.pct1rm / 100);
        return {
            rationale: `${this.config.pct1rm}% of 1RM.`,
            reps: this.config.targetReps,
            weightKg,
        };
    }
}

export class RpeTargetProgression extends ProgressionRule {
    readonly id = 'rpe_target' as const;
    readonly label = 'RPE target';

    constructor(private readonly config: RpeTargetProgressionConfig) {
        super();
    }

    suggest(history: SessionSummary[]): ProgressionSuggestion {
        const last = history.at(-1);
        if (!last) {
            return {
                rationale: 'No history.',
                reps: this.config.targetReps,
                weightKg: 0,
            };
        }
        const candidate = last.sets.findLast(
            (s) => s.completed && s.rpe !== undefined,
        );
        if (candidate?.rpe === undefined) {
            return {
                rationale: 'No RPE recorded last session.',
                reps: this.config.targetReps,
                weightKg: 0,
            };
        }
        const rpeDelta = this.config.targetRpe - candidate.rpe;
        const pctAdjust = 1 + rpeDelta * 0.025;
        return {
            rationale: `Adjusting ${(pctAdjust * 100 - 100).toFixed(1)}% to target RPE ${this.config.targetRpe}.`,
            reps: this.config.targetReps,
            weightKg: candidate.weightKg * pctAdjust,
        };
    }
}
