import { expect } from 'vitest';

const PHONE_COLUMNS_CLASS = /^(?:sm:)?grid-cols-/;
const TABLET_TWO_COLUMNS_CLASS = 'md:grid-cols-2';

export function expectDialogFieldGridsOneColumnBelowMd(): void {
    const grids = [
        ...document.body.querySelectorAll<HTMLElement>(
            ':scope [role="dialog"] .grid',
        ),
    ].map((grid) => [...grid.classList]);
    expect(
        grids.filter((classes) => classes.includes(TABLET_TWO_COLUMNS_CLASS)),
    ).not.toEqual([]);
    expect(
        grids.flatMap((classes) =>
            classes.filter((name) => PHONE_COLUMNS_CLASS.test(name)),
        ),
    ).toEqual([]);
}
