import { formatConjunctionList, formatPercent } from '~/lib/format';
import {
    LADDER_IGNORED_INPUT_REASONS,
    LadderIgnoredInput,
    SIM_DEFAULTS,
    type SimInputs,
} from '~/lib/prop-calculator';

interface IgnoredInput {
    input: LadderIgnoredInput;
    setting: string;
}

type LadderIgnoredInputs = Pick<
    SimInputs,
    'idleDayProbability' | 'maxAttempts' | 'rebuyLagDays'
>;

export function describeLadderIgnoredInputs(
    inputs: LadderIgnoredInputs,
): null | string {
    const ignored = ignoredInputs(inputs);
    if (ignored.length === 0) return null;
    const settings = formatConjunctionList(
        ignored.map((input) => input.setting),
    );
    const reasons = formatConjunctionList(
        ignored.map(({ input }) => `it ${LADDER_IGNORED_INPUT_REASONS[input]}`),
    );
    const pronoun = ignored.length === 1 ? 'it' : 'them';
    return `Ladder Lab ignores ${settings}: ${reasons}. The main simulation still applies ${pronoun}.`;
}

function ignoredInputs({
    idleDayProbability = SIM_DEFAULTS.idleDayProbability,
    maxAttempts = SIM_DEFAULTS.maxAttempts,
    rebuyLagDays = SIM_DEFAULTS.rebuyLagDays,
}: LadderIgnoredInputs): IgnoredInput[] {
    const ignored: IgnoredInput[] = [];
    if (idleDayProbability > SIM_DEFAULTS.idleDayProbability) {
        ignored.push({
            input: LadderIgnoredInput.IdleDays,
            setting: `the idle-day probability of ${formatPercent(idleDayProbability, 0)}`,
        });
    }
    if (maxAttempts > SIM_DEFAULTS.maxAttempts) {
        ignored.push({
            input: LadderIgnoredInput.MaxAttempts,
            setting: `the max reset attempts of ${maxAttempts}`,
        });
    }
    if (rebuyLagDays > SIM_DEFAULTS.rebuyLagDays) {
        ignored.push({
            input: LadderIgnoredInput.RebuyLag,
            setting: `the rebuy lag of ${rebuyLagDays} ${rebuyLagDays === 1 ? 'day' : 'days'}`,
        });
    }
    return ignored;
}
