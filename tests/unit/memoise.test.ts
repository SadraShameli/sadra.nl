import { describe, expect, it, vi } from 'vitest';

import { memoise } from './memoise';

describe('memoise', () => {
    it('builds once and returns the same value on every call', () => {
        const build = vi.fn(() => ({ solved: true }));
        const get = memoise(build);

        expect(get()).toBe(get());
        expect(build).toHaveBeenCalledTimes(1);
    });

    it.each([null, undefined, 0, ''])(
        'builds once when the built value is %j',
        (value) => {
            const build = vi.fn(() => value);
            const get = memoise(build);

            get();
            get();

            expect(build).toHaveBeenCalledTimes(1);
        },
    );

    it('builds nothing until the first call', () => {
        const build = vi.fn(() => 1);
        memoise(build);

        expect(build).not.toHaveBeenCalled();
    });
});
