import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { planReferenceOf } from '~/app/(app)/prop-calculator/_components/bankroll/bankrollModel';
import { findFirm, FirmId, serializePlanId } from '~/lib/prop-calculator';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');
const COMPONENTS = 'src/app/(app)/prop-calculator/_components';
const USE_TOOLS_WORKER = `${COMPONENTS}/useToolsWorker.ts`;
const USE_LAB_SIMULATION = `${COMPONENTS}/useLabSimulation.ts`;
const PLAN_REFERENCE_HOME = `${COMPONENTS}/bankroll/bankrollModel.ts`;
const PLAN_REFERENCE_USERS = [
    `${COMPONENTS}/useLabSimulation.ts`,
    `${COMPONENTS}/value/valueCardsModel.ts`,
    'src/app/(app)/prop-calculator/accounts/rounds/roundsModel.ts',
];

function textOf(relativePath: string): string {
    return readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function topStepPlan() {
    const plan = findFirm(FirmId.TopStep)?.findPlanBySerial(
        'topstep-50000-standard-standard',
    );
    if (plan == null) throw new Error('TopStep 50K plan not found');
    return plan;
}

describe('one tools worker factory and one failure reason (PT-63c, PT-73e leftover)', () => {
    it('exports the worker factory and the failure reason from useToolsWorker', () => {
        const text = textOf(USE_TOOLS_WORKER);
        expect(text).toMatch(/export function createToolsWorker\(/);
        expect(text).toMatch(/export const WORKER_FAILURE_REASON\b/);
    });

    it('lets useLabSimulation import them instead of keeping its own copies', () => {
        const text = textOf(USE_LAB_SIMULATION);
        expect(text).not.toMatch(/function createLabWorker\(/);
        expect(text).not.toMatch(/const WORKER_FAILURE_REASON\b/);
        expect(text).not.toMatch(/new Worker\(/);
        expect(text).toMatch(
            /import\s*{[^}]*createToolsWorker[^}]*}\s*from\s*'\.\/useToolsWorker'/,
        );
        expect(text).toMatch(
            /import\s*{[^}]*WORKER_FAILURE_REASON[^}]*}\s*from\s*'\.\/useToolsWorker'/,
        );
    });

    it('constructs the tools Worker in exactly one place', () => {
        expect(textOf(USE_TOOLS_WORKER).match(/new Worker\(/g)).toHaveLength(1);
    });
});

describe('one plan reference builder (PT-63c, PT-73e leftover)', () => {
    it('builds the firm, serial and opt-ins reference of a plan', () => {
        const plan = topStepPlan();
        expect(planReferenceOf(plan)).toStrictEqual({
            firmId: FirmId.TopStep,
            optIns: {
                takesFundedReset: plan.takesFundedReset,
                takesOneTimeEarlyWithdrawal: plan.takesOneTimeEarlyWithdrawal,
            },
            planSerial: serializePlanId(plan.id),
        });
    });

    it('takes the opt-ins the caller holds when they are not the plan own', () => {
        const reference = planReferenceOf(topStepPlan(), {
            takesFundedReset: true,
            takesOneTimeEarlyWithdrawal: true,
        });
        expect(reference.optIns).toStrictEqual({
            takesFundedReset: true,
            takesOneTimeEarlyWithdrawal: true,
        });
    });

    it('serializes the plan id into a reference in exactly one place', () => {
        expect(
            textOf(PLAN_REFERENCE_HOME).match(
                /planSerial:\s*serializePlanId\(/g,
            ),
        ).toHaveLength(1);
        expect(textOf(PLAN_REFERENCE_HOME)).toMatch(
            /export function planReferenceOf\(/,
        );
    });

    it.each([PLAN_REFERENCE_HOME, ...PLAN_REFERENCE_USERS])(
        '%s builds its plan reference through planReferenceOf',
        (file) => {
            const text = textOf(file);
            if (file !== PLAN_REFERENCE_HOME) {
                expect(text).not.toMatch(/planSerial:\s*serializePlanId\(/);
            }
            expect(text).toMatch(/planReferenceOf\(/);
        },
    );
});
