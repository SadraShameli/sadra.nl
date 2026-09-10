/// <reference lib="webworker" />

import { findFirm, scoreLadder } from '~/lib/prop-calculator';
import { deriveSubSeed, mulberry32 } from '~/lib/prop-calculator/rng';

import {
    type LadderWorkerRequest,
    type LadderWorkerResponse,
    LadderWorkerResponseKind,
} from './ladderWorkerMessages';

function fail(runId: number, reason: string): void {
    const response: LadderWorkerResponse = {
        kind: LadderWorkerResponseKind.Failed,
        reason,
        runId,
    };
    self.postMessage(response);
}

self.addEventListener('message', (event: MessageEvent<LadderWorkerRequest>) => {
    const request = event.data;

    try {
        const firm = findFirm(request.planId.firm);
        const plan = firm?.findPlan(request.planId);
        if (!plan) {
            fail(
                request.runId,
                `Plan not found for firm "${request.planId.firm}".`,
            );
            return;
        }

        const config = {
            cushion: request.cushion,
            evalPrice: request.evalPrice,
            maxDays: request.maxDays,
            plan,
            rrRatio: request.rrRatio,
            rungSizing: request.rungSizing,
            seedOffset: 0,
            sims: request.sims,
            stopRule: request.stopRule,
            winrate: request.winrate,
        };

        const scores = request.ladders.map((ladder, offset) =>
            scoreLadder(
                ladder,
                config,
                mulberry32(
                    deriveSubSeed(request.seed, request.firstIndex + offset, 0),
                ),
            ),
        );

        const response: LadderWorkerResponse = {
            firstIndex: request.firstIndex,
            kind: LadderWorkerResponseKind.Scored,
            runId: request.runId,
            scores,
        };
        self.postMessage(response);
    } catch (error) {
        fail(
            request.runId,
            error instanceof Error ? error.message : 'Unknown worker error.',
        );
    }
});
