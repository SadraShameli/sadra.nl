'use client';

import { useEffect, useRef } from 'react';

import {
    type ToolsWorker,
    useToolsWorker,
} from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import { type ToolsWorkerRequest } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';

export function useToolsRequest(
    requestKey: null | string,
    buildRequest: (runId: number) => null | ToolsWorkerRequest,
): ToolsWorker {
    const worker = useToolsWorker();
    const runIdReference = useRef(0);
    const requestedKeyReference = useRef<null | string>(null);

    useEffect(
        () => () => {
            requestedKeyReference.current = null;
        },
        [],
    );

    useEffect(() => {
        if (
            requestKey === null ||
            requestedKeyReference.current === requestKey
        ) {
            return;
        }
        const request = buildRequest(runIdReference.current + 1);
        if (request === null) return;
        requestedKeyReference.current = requestKey;
        runIdReference.current = request.runId;
        worker.run(request);
    }, [buildRequest, requestKey, worker]);

    return worker;
}
