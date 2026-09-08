/// <reference lib="webworker" />

import { findFirm, scoreLadder } from '~/lib/prop-calculator';
import { deriveSubSeed, mulberry32 } from '~/lib/prop-calculator/rng';

import type {
    LadderWorkerRequest,
    LadderWorkerResponse,
} from './ladderWorkerMessages';

self.addEventListener('message', (event: MessageEvent<LadderWorkerRequest>) => {
    const request = event.data;
    const firm = findFirm(request.planId.firm);
    const plan = firm?.findPlan(request.planId);
    if (!plan) {
        const empty: LadderWorkerResponse = {
            requestId: request.requestId,
            scores: [],
        };
        self.postMessage(empty);
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
        requestId: request.requestId,
        scores,
    };
    self.postMessage(response);
});
