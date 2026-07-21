export interface PlateLoad {
    perSide: number[];
    remainderKg: number;
    totalLoadedKg: number;
}

export class PlateCalculator {
    readonly bar: number;

    readonly plates: readonly number[];

    constructor(barKg: number, availableKg: readonly number[]) {
        this.bar = Math.max(0, barKg);
        this.plates = availableKg
            .filter((p) => Number.isFinite(p) && p > 0)
            .toSorted((a, b) => b - a);
    }

    load(targetKg: number): PlateLoad {
        if (!Number.isFinite(targetKg) || targetKg <= this.bar) {
            return {
                perSide: [],
                remainderKg: targetKg < this.bar ? this.bar - targetKg : 0,
                totalLoadedKg: this.bar,
            };
        }

        const totalPlatesKg = targetKg - this.bar;
        let perSideKg = totalPlatesKg / 2;
        const perSide: number[] = [];

        for (const plate of this.plates) {
            while (perSideKg + 1e-6 >= plate) {
                perSide.push(plate);
                perSideKg -= plate;
            }
        }

        const remainderKg = perSideKg * 2;
        const totalLoadedKg = targetKg - remainderKg;

        return { perSide, remainderKg, totalLoadedKg };
    }
}
