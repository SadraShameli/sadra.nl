import { type DatedCharge } from '../core/DatedCharge';

export interface CardChargeCursorInputs {
    evalDays: number;
    evalRetryCharges: readonly DatedCharge[];
    fundedResetCharges: readonly DatedCharge[];
    spreadEvalCost: number;
}

export class CardChargeCursor {
    private readonly evalDays: number;
    private readonly evalRetries: DatedChargeCursor;
    private readonly fundedResets: DatedChargeCursor;
    private readonly spreadEvalCost: number;

    constructor(inputs: CardChargeCursorInputs) {
        this.evalDays = inputs.evalDays;
        this.evalRetries = new DatedChargeCursor(inputs.evalRetryCharges);
        this.fundedResets = new DatedChargeCursor(inputs.fundedResetCharges);
        this.spreadEvalCost = inputs.spreadEvalCost;
    }

    private spreadPortionThrough(day: number): number {
        return this.evalDays > 0
            ? (this.spreadEvalCost * Math.min(day, this.evalDays)) /
                  this.evalDays
            : this.spreadEvalCost;
    }

    paidThrough(day: number): number {
        return (
            this.evalRetries.paidThrough(day) +
            this.fundedResets.paidThrough(day) +
            this.spreadPortionThrough(day)
        );
    }
}

export class DatedChargeCursor {
    private index = 0;
    private paid = 0;

    constructor(private readonly charges: readonly DatedCharge[]) {}

    paidThrough(day: number): number {
        for (
            let charge = this.charges[this.index];
            charge !== undefined && charge.dayOffset <= day;
            charge = this.charges[this.index]
        ) {
            this.paid += charge.fee;
            this.index += 1;
        }
        return this.paid;
    }
}
