import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useToolsRequest } from '~/app/(app)/prop-calculator/_components/bankroll/useToolsRequest';
import {
    type ToolsWorker,
    ToolsWorkerPhase,
} from '~/app/(app)/prop-calculator/_components/useToolsWorker';

import {
    FakeWorker,
    projectionRequest,
    projectionResult,
} from '../toolsWorkerFixtures';

interface Latest {
    current: null | ToolsWorker;
}

function Harness({
    latest,
    requestKey,
}: {
    readonly latest: Latest;
    readonly requestKey: string;
}) {
    latest.current = useToolsRequest(requestKey, projectionRequest);
    return null;
}

function liveWorkers(): FakeWorker[] {
    return FakeWorker.instances.filter((worker) => !worker.terminated);
}

describe('useToolsRequest', () => {
    let root: Root;
    let container: HTMLElement;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        FakeWorker.instances = [];
        vi.stubGlobal('Worker', FakeWorker);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        vi.unstubAllGlobals();
    });

    it('keeps one live worker for the request after the StrictMode double mount and reports its result', () => {
        const latest: Latest = { current: null };
        act(() => {
            root.render(
                <StrictMode>
                    <Harness latest={latest} requestKey="a" />
                </StrictMode>,
            );
        });

        const live = liveWorkers();
        expect(live).toHaveLength(1);
        const request = live[0]?.posted[0];
        expect(request).toBeDefined();

        act(() => {
            live[0]?.emit(
                'message',
                projectionResult((request as { runId: number }).runId),
            );
        });
        expect(latest.current?.state.phase).toBe(ToolsWorkerPhase.Succeeded);
    });

    it('does not request again when the key is unchanged and requests again when it changes', () => {
        const latest: Latest = { current: null };
        act(() => {
            root.render(<Harness latest={latest} requestKey="a" />);
        });
        act(() => {
            root.render(<Harness latest={latest} requestKey="a" />);
        });
        expect(FakeWorker.instances).toHaveLength(1);

        act(() => {
            root.render(<Harness latest={latest} requestKey="b" />);
        });
        expect(FakeWorker.instances).toHaveLength(2);
        expect(liveWorkers()).toHaveLength(1);
    });
});
