import { type MockInstance, vi } from 'vitest';

export function stubLocationAssign(
    onAssign: () => void = doNothing,
): MockInstance<Location['assign']> {
    return vi.spyOn(window.location, 'assign').mockImplementation(onAssign);
}

function doNothing(): void {
    return;
}
