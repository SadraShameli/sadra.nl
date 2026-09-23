/// <reference lib="webworker" />

import {
    findFirm,
    type LadderScoreConfig,
    ladderTrialStreams,
    resolvePositionSizing,
    scoreLadder,
} from '~/lib/prop-calculator';

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

        const config: LadderScoreConfig = {
            commission: request.commission,
            cushion: request.cushion,
            discounts: request.discounts,
            maxDays: request.maxDays,
            plan,
            positionSizing: resolvePositionSizing(
                request.instrument,
                request.stopPoints,
            ),
            rrRatio: request.rrRatio,
            rungSizing: request.rungSizing,
            seedOffset: 0,
            sims: request.sims,
            stopRule: request.stopRule,
            winrate: request.winrate,
        };

        const trialRng = ladderTrialStreams(request.seed);
        const scores = request.ladders.map((ladder) =>
            scoreLadder(ladder, config, trialRng),
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
