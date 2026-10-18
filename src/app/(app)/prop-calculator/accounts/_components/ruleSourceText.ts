import { formatConjunctionList } from '~/lib/format';
import {
    RULE_SOURCE_LABEL,
    type RuleSource,
} from '~/lib/prop-calculator/advisor';

export function ruleSourceListText(sources: readonly RuleSource[]): string {
    return formatConjunctionList(
        sources.map((source) => RULE_SOURCE_LABEL[source]),
    );
}
