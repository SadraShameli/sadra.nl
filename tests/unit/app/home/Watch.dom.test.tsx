import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Watch } from '~/app/(app)/_components/home/Watch';

class CurrentTimeReadDuringPrerenderError extends Error {
    constructor() {
        super('The current time was read while prerendering');
        this.name = 'CurrentTimeReadDuringPrerenderError';
    }
}

const RealDate = Date;

class PrerenderDate extends RealDate {
    static override now(): number {
        throw new CurrentTimeReadDuringPrerenderError();
    }

    constructor(...parts: [] | [Date | number | string]) {
        if (parts.length === 0) throw new CurrentTimeReadDuringPrerenderError();
        super(parts[0]);
    }
}

describe('Watch', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('never reads the current time while prerendering, so the footer does not block static routes', () => {
        vi.stubGlobal('Date', PrerenderDate);

        const html = renderToString(<Watch />);

        expect(html).toContain('--:--:--');
        expect(html).toMatch(/NYSE (<!-- -->)?CLOSED/);
    });
});
