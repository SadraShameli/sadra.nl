import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import * as advisor from '~/lib/prop-calculator/advisor';
import * as firms from '~/lib/prop-calculator/firms';

const ADVISOR_BARREL = path.join(
    process.cwd(),
    'src/lib/prop-calculator/advisor/index.ts',
);

const APPLICABILITY_NAMES = [
    'isLiveModelApproximation',
    'LiveApplicabilityKind',
    'LiveApplicabilityNote',
    'LiveNotModeledReason',
    'livePlanApplicability',
    'LiveStateApproximation',
] as const;

describe('the live applicability surface has one public home, the firms barrel (PT-73c)', () => {
    it.each(APPLICABILITY_NAMES)(
        'exports %s from the firms barrel',
        (name) => {
            expect(firms).toHaveProperty(name);
        },
    );

    it.each(APPLICABILITY_NAMES)(
        'does not re-export %s from the advisor barrel',
        (name) => {
            expect(advisor).not.toHaveProperty(name);
        },
    );

    it('keeps no import from the firms barrel in the advisor barrel', () => {
        expect(readFileSync(ADVISOR_BARREL, 'utf8')).not.toContain(
            '~/lib/prop-calculator/firms',
        );
    });
});
