import { type Grade, GRADE_VALUES } from '~/lib/trading/types';

const GRADE_TEXT_CLASS: Record<Grade, string> = {
    A: 'text-success',
    'A+': 'text-success',
    'A-': 'text-success',
    B: 'text-warning',
    'B+': 'text-success',
    'B-': 'text-warning',
    C: 'text-warning',
    'C+': 'text-warning',
    'C-': 'text-warning',
    D: 'text-destructive',
    F: 'text-destructive',
};

export function gradeTextClass(grade: string): string {
    const known = GRADE_VALUES.find((value) => value === grade);
    return known === undefined ? 'text-foreground' : GRADE_TEXT_CLASS[known];
}
