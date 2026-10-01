import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    ToolsWorkerPhase,
    useToolsWorker,
} from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import { ToolsResponseKind } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';

import {
    FakeWorker,
    projectionRequest,
    projectionResult,
} from './toolsWorkerFixtures';

type ToolsWorkerHandle = ReturnType<typeof useToolsWorker>;

function Harness({ latest }: { latest: { current: null | ToolsWorkerHandle } }) {
    latest.current = useToolsWorker();
    return null;
}

function renderHarness(root: Root, latest: { current: null | ToolsWorkerHandle }): void {
    act(() => {
        root.render(<Harness latest={latest} />);
    });
}

describe('useToolsWorker', () => {
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

    it('posts the request, matches the runId and reports the parsed result', () => {
        const latest: { current: null | ToolsWorkerHandle } = { current: null };
        renderHarness(root, latest);
        expect(latest.current?.state.phase).toBe(ToolsWorkerPhase.Idle);

        act(() => {
            latest.current?.run(projectionRequest(1));
        });
        expect(latest.current?.state.phase).toBe(ToolsWorkerPhase.Running);
        expect(FakeWorker.instances).toHaveLength(1);
        expect(FakeWorker.instances[0]?.posted).toEqual([projectionRequest(1)]);

        act(() => {
            FakeWorker.instances[0]?.emit('message', projectionResult(1));
        });
        expect(latest.current?.state.phase).toBe(ToolsWorkerPhase.Succeeded);
        expect(FakeWorker.instances[0]?.terminated).toBe(true);
    });

    it('ignores a stale response whose runId does not match the latest run', () => {
        const latest: { current: null | ToolsWorkerHandle } = { current: null };
        renderHarness(root, latest);

        act(() => {
            latest.current?.run(projectionRequest(1));
        });
        const staleWorker = FakeWorker.instances[0];
        act(() => {
            latest.current?.run(projectionRequest(2));
        });
        expect(FakeWorker.instances).toHaveLength(2);
        expect(staleWorker?.terminated).toBe(true);

        act(() => {
            staleWorker?.emit('message', projectionResult(1));
        });
        expect(latest.current?.state.phase).toBe(ToolsWorkerPhase.Running);

        act(() => {
            FakeWorker.instances[1]?.emit('message', projectionResult(2));
        });
        expect(latest.current?.state.phase).toBe(ToolsWorkerPhase.Succeeded);
    });

    it('reports a Failed response as Failed', () => {
        const latest: { current: null | ToolsWorkerHandle } = { current: null };
        renderHarness(root, latest);
        act(() => {
            latest.current?.run(projectionRequest(1));
        });
        act(() => {
            FakeWorker.instances[0]?.emit('message', {
                kind: ToolsResponseKind.Failed,
                reason: 'no plan',
                runId: 1,
            });
        });
        expect(latest.current?.state).toEqual({
            phase: ToolsWorkerPhase.Failed,
            reason: 'no plan',
        });
    });

    it('marks a running task Cancelled and terminates the worker', () => {
        const latest: { current: null | ToolsWorkerHandle } = { current: null };
        renderHarness(root, latest);
        act(() => {
            latest.current?.run(projectionRequest(1));
        });
        act(() => {
            latest.current?.cancel();
        });
        expect(latest.current?.state.phase).toBe(ToolsWorkerPhase.Cancelled);
        expect(FakeWorker.instances[0]?.terminated).toBe(true);

        act(() => {
            FakeWorker.instances[0]?.emit('message', projectionResult(1));
        });
        expect(latest.current?.state.phase).toBe(ToolsWorkerPhase.Cancelled);
    });
});
