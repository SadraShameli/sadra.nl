import { PR_KIND_VALUES, type PrKind } from '~/lib/lifting/types';

export const PR_KIND_LABEL: Record<PrKind, string> = {
    best_volume_set: 'Best volume set',
    estimated_1rm: 'Estimated 1RM',
    heaviest_weight: 'Heaviest weight',
    reps_at_weight: 'Reps at weight',
};

export function prKindLabel(kind: string): string {
    const known = PR_KIND_VALUES.find((value) => value === kind);
    return known === undefined ? kind : PR_KIND_LABEL[known];
}
