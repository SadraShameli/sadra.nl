import { type MockInstance, vi } from 'vitest';

export function stubLocationAssign(
    onAssign: () => void,
): MockInstance<Location['assign']> {
    return vi.spyOn(window.location, 'assign').mockImplementation(onAssign);
}
