export interface PlateLoad {
    perSide: number[];
    remainderKg: number;
    totalLoadedKg: number;
}

export class PlateCalculator {
    get bar(): number {
        return this.barKg;
    }
    get plates(): readonly number[] {
        return this.available;
    }

    private readonly available: number[];

    private readonly barKg: number;

    constructor(barKg: number, availableKg: readonly number[]) {
        this.barKg = Math.max(0, barKg);
        this.available = availableKg
            .filter((p) => Number.isFinite(p) && p > 0)
            .toSorted((a, b) => b - a);
    }

    load(targetKg: number): PlateLoad {
        if (!Number.isFinite(targetKg) || targetKg <= this.barKg) {
            return {
                perSide: [],
                remainderKg: targetKg < this.barKg ? this.barKg - targetKg : 0,
                totalLoadedKg: this.barKg,
            };
        }

        const totalPlatesKg = targetKg - this.barKg;
        let perSideKg = totalPlatesKg / 2;
        const perSide: number[] = [];

        for (const plate of this.available) {
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
