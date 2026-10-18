import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    type StreamHandle,
    useImportStream,
} from '~/app/(app)/accounting/_components/useImportStream';
import { asSseResponse } from '~/lib/accounting/sse';

interface StageEvent {
    kind: 'stage';
}

const latest: { handle: null | StreamHandle<StageEvent> } = { handle: null };

function currentHandle(): StreamHandle<StageEvent> {
    if (latest.handle === null) throw new TypeError('hook not mounted');
    return latest.handle;
}

function Probe() {
    latest.handle = useImportStream<StageEvent>();
    return null;
}

async function* rejectedRun(): AsyncIterable<StageEvent> {
    await Promise.resolve();
    yield { kind: 'stage' };
    throw new Error('Rejected credentials');
}

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    latest.handle = null;
    document.body.replaceChildren();
});

describe('useImportStream', () => {
    it('surfaces a named server error instead of treating it as an event', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            asSseResponse(rejectedRun()),
        );
        const container = document.createElement('div');
        document.body.append(container);
        const root = createRoot(container);
        await act(async () => {
            root.render(<Probe />);
            await Promise.resolve();
        });

        await act(async () => {
            await currentHandle().start({ url: '/api/accounting/run' });
        });

        const handle = currentHandle();
        expect(handle.error).toBe('Rejected credentials');
        expect(handle.events).toEqual([{ kind: 'stage' }]);
        await act(async () => {
            root.unmount();
            await Promise.resolve();
        });
    });
});
