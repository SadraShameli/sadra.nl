export abstract class OneRepMaxFormula {
    abstract readonly id: string;
    abstract readonly label: string;
    abstract estimate(weight: number, reps: number): number;
    abstract weightFor(targetOneRepMax: number, reps: number): number;
}

export class BrzyckiFormula extends OneRepMaxFormula {
    readonly id = 'brzycki';
    readonly label = 'Brzycki';

    estimate(weight: number, reps: number): number {
        if (reps <= 1) return weight;
        if (reps >= 37) return weight;
        return (weight * 36) / (37 - reps);
    }

    weightFor(targetOneRepMax: number, reps: number): number {
        if (reps <= 1) return targetOneRepMax;
        if (reps >= 37) return targetOneRepMax;
        return (targetOneRepMax * (37 - reps)) / 36;
    }
}

export class EpleyFormula extends OneRepMaxFormula {
    readonly id = 'epley';
    readonly label = 'Epley';

    estimate(weight: number, reps: number): number {
        if (reps <= 1) return weight;
        return weight * (1 + reps / 30);
    }

    weightFor(targetOneRepMax: number, reps: number): number {
        if (reps <= 1) return targetOneRepMax;
        return targetOneRepMax / (1 + reps / 30);
    }
}

export class LombardiFormula extends OneRepMaxFormula {
    readonly id = 'lombardi';
    readonly label = 'Lombardi';

    estimate(weight: number, reps: number): number {
        if (reps <= 1) return weight;
        return weight * Math.pow(reps, 0.1);
    }

    weightFor(targetOneRepMax: number, reps: number): number {
        if (reps <= 1) return targetOneRepMax;
        return targetOneRepMax / Math.pow(reps, 0.1);
    }
}

export const ONE_REP_MAX_FORMULAS: readonly OneRepMaxFormula[] = [
    new EpleyFormula(),
    new BrzyckiFormula(),
    new LombardiFormula(),
];

export class OneRepMaxCalculator {
    private static readonly MAX_REPS_REASONABLE = 20;

    constructor(
        private readonly formulas: readonly OneRepMaxFormula[] = ONE_REP_MAX_FORMULAS,
    ) {}

    estimate(weight: number, reps: number): number {
        if (!Number.isFinite(weight) || weight <= 0) return 0;
        if (!Number.isFinite(reps) || reps <= 0) return 0;
        if (reps > OneRepMaxCalculator.MAX_REPS_REASONABLE) return 0;
        if (reps === 1) return weight;

        const sum = this.formulas.reduce(
            (acc, f) => acc + f.estimate(weight, reps),
            0,
        );
        return sum / this.formulas.length;
    }

    weightFor(targetOneRepMax: number, reps: number): number {
        if (!Number.isFinite(targetOneRepMax) || targetOneRepMax <= 0) return 0;
        if (!Number.isFinite(reps) || reps <= 0) return 0;
        if (reps > OneRepMaxCalculator.MAX_REPS_REASONABLE) return 0;
        if (reps === 1) return targetOneRepMax;

        const sum = this.formulas.reduce(
            (acc, f) => acc + f.weightFor(targetOneRepMax, reps),
            0,
        );
        return sum / this.formulas.length;
    }
}

export const oneRepMaxCalculator = new OneRepMaxCalculator();
