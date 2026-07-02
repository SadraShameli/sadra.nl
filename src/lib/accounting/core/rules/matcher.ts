const normalise = (s: string): string => s.toLowerCase().replaceAll(' ', '');

export interface RuleMatcher {
    matches(merchant: string): boolean;
}

export class ContainsMatcher implements RuleMatcher {
    constructor(private readonly pattern: string) {}

    matches(merchant: string): boolean {
        return normalise(merchant).includes(normalise(this.pattern));
    }
}

export class ExactMatcher implements RuleMatcher {
    constructor(private readonly pattern: string) {}

    matches(merchant: string): boolean {
        return normalise(merchant) === normalise(this.pattern);
    }
}

export class RegexMatcher implements RuleMatcher {
    private readonly regex: RegExp;

    constructor(pattern: string) {
        this.regex = new RegExp(pattern, 'i');
    }

    matches(merchant: string): boolean {
        return this.regex.test(merchant);
    }
}

export const MATCH_TYPES = ['contains', 'exact', 'regex'] as const;

export type MatchType = (typeof MATCH_TYPES)[number];

export const MatcherFactory = {
    create(matchType: MatchType, pattern: string): RuleMatcher {
        switch (matchType) {
            case 'contains': {
                return new ContainsMatcher(pattern);
            }
            case 'exact': {
                return new ExactMatcher(pattern);
            }
            case 'regex': {
                return new RegexMatcher(pattern);
            }
        }
    },
};
