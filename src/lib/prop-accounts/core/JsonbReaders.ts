import { type PlanOptIns } from '~/lib/prop-calculator';
import {
    type RulebookParameters,
    rulebookSchema,
    withRulebookDefaults,
} from '~/lib/prop-calculator/advisor';

import {
    type AccountEventDetail,
    accountEventDetailSchema,
} from './AccountEventKind';
import { type PersonalRules, personalRulesSchema } from './PersonalRules';
import { storedPlanOptInsSchema } from './PlanKey';

export function readAccountEventDetail(raw: unknown): AccountEventDetail {
    return accountEventDetailSchema.parse(raw);
}

export function readPersonalRules(raw: unknown): PersonalRules {
    return personalRulesSchema.parse(raw);
}

export function readPersonalRulesOrNull(raw: unknown): null | PersonalRules {
    return personalRulesSchema.safeParse(raw).data ?? null;
}

export function readPlanOptIns(raw: unknown): PlanOptIns {
    return storedPlanOptInsSchema.parse(raw);
}

export function readPlanOptInsOrNull(raw: unknown): null | PlanOptIns {
    return storedPlanOptInsSchema.safeParse(raw).data ?? null;
}

export function readRulebookParameters(raw: unknown): RulebookParameters {
    return rulebookSchema.parse(withRulebookDefaults(raw));
}
