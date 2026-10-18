import { type Rng } from '~/lib/prop-calculator/rng';

export function scriptedRng(draws: readonly number[], fallback?: number): Rng {
    let index = 0;
    return () => {
        const draw = draws[index] ?? fallback;
        if (draw === undefined) throw new Error('scripted rng exhausted');
        index += 1;
        return draw;
    };
}
