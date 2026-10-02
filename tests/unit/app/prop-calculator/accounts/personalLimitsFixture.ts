import { type PersonalLimits } from '~/app/(app)/prop-calculator/accounts/_components/advice/adviceViewModel';
import { NO_PERSONAL_CAPS } from '~/lib/prop-calculator/advisor';

export const NO_PERSONAL_LIMITS: PersonalLimits = {
    caps: NO_PERSONAL_CAPS,
    dailyLossLimit: null,
};
