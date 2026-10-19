import { type Route } from 'next';
import { z } from 'zod';

const SAME_ORIGIN_PATH = /^\/(?![/\\])[^\\\p{Cc}]*$/u;

export const sameOriginRouteSchema = z.custom<Route>(
    (value) => typeof value === 'string' && SAME_ORIGIN_PATH.test(value),
    'Must be a same-origin path',
);

export const routes = {
    accounting: {
        connections: '/accounting/connections',
        index: '/accounting',
        ledgers: '/accounting/ledgers',
        mutations: '/accounting/mutations',
        rules: '/accounting/rules',
        run: (id: string) => `/accounting/runs/${id}` as const,
        runs: '/accounting/runs',
        transactions: '/accounting/transactions',
    },
    auth: {
        error: '/auth-error',
        forgotPassword: '/forgot-password',
        login: '/login',
        resetPassword: '/reset-password',
        signup: '/signup',
        verifyRequest: '/verify-request',
    },
    contact: '/contact',
    home: '/',
    legal: {
        privacy: '/legal/privacy',
        terms: '/legal/terms',
    },
    lifting: {
        analytics: '/lifting/analytics',
        body: '/lifting/body',
        exercise: (slug: string) => `/lifting/exercises/${slug}` as const,
        exercises: '/lifting/exercises',
        goals: '/lifting/goals',
        history: '/lifting/history',
        index: '/lifting',
        log: '/lifting/log',
        program: (slug: string) => `/lifting/programs/${slug}` as const,
        programs: '/lifting/programs',
        routines: '/lifting/routines',
        settings: '/profile?tab=lifting',
        workout: (id: string) => `/lifting/workouts/${id}` as const,
    },
    portfolio: '/portfolio',
    profile: '/profile',
    propCalculator: {
        accounts: {
            copyGroups: '/prop-calculator/accounts/copy-groups',
            detail: (id: string) => `/prop-calculator/accounts/${id}` as const,
            edge: '/prop-calculator/accounts/edge',
            edit: (id: string) =>
                `/prop-calculator/accounts/${id}/edit` as const,
            firms: '/prop-calculator/accounts/firms',
            import: '/prop-calculator/accounts/import',
            index: '/prop-calculator/accounts',
            ledger: '/prop-calculator/accounts/ledger',
            new: '/prop-calculator/accounts/new',
            nextSlot: '/prop-calculator/accounts/next-slot',
            review: '/prop-calculator/accounts/review',
            rounds: '/prop-calculator/accounts/rounds',
            rulebook: '/prop-calculator/accounts/rulebook',
        },
        analysis: '/prop-calculator/analysis',
        bankroll: '/prop-calculator/bankroll',
        cashFlow: '/prop-calculator/cash-flow',
        compare: '/prop-calculator/compare',
        fundedOptimizer: '/prop-calculator/funded-optimizer',
        index: '/prop-calculator',
        ladderLab: '/prop-calculator/ladder-lab',
        live: '/prop-calculator/live',
        payoutPlanner: '/prop-calculator/payout-planner',
        planner: '/prop-calculator/planner',
        positionSize: '/prop-calculator/position-size',
        rules: '/prop-calculator/rules',
        simulator: '/prop-calculator/simulator',
        sizing: '/prop-calculator/sizing',
        strategyLab: '/prop-calculator/strategy-lab',
    },
    resume: {
        index: '/resume',
        pdf: (name: string) => `/resume/${name}/pdf` as const,
    },
    tradeChecklist: {
        analytics: '/trade-checklist/analytics',
        calendar: '/trade-checklist/calendar',
        index: '/trade-checklist',
        journal: '/trade-checklist/journal',
        prep: '/trade-checklist/prep',
    },
} as const;

export const apiRoutes = {
    accounting: {
        post: '/api/accounting/post',
        run: '/api/accounting/run',
    },
    health: '/api/health',
    recording: (id: number | string) => `/api/recording/${id}` as const,
    trpc: '/api/trpc',
} as const;

export const indexableRoutes: readonly string[] = [
    routes.home,
    routes.portfolio,
    routes.propCalculator.index,
    routes.propCalculator.simulator,
    routes.propCalculator.analysis,
    routes.propCalculator.bankroll,
    routes.propCalculator.sizing,
    routes.propCalculator.compare,
    routes.propCalculator.cashFlow,
    routes.propCalculator.ladderLab,
    routes.propCalculator.strategyLab,
    routes.propCalculator.planner,
    routes.propCalculator.positionSize,
    routes.propCalculator.fundedOptimizer,
    routes.propCalculator.rules,
    routes.propCalculator.live,
    routes.propCalculator.payoutPlanner,
    routes.contact,
    routes.legal.privacy,
    routes.legal.terms,
];

export const disallowedCrawlPaths: readonly string[] = [
    '/api/',
    routes.profile,
    routes.auth.error,
    routes.accounting.index,
    routes.lifting.index,
    routes.propCalculator.accounts.index,
    routes.tradeChecklist.index,
];

export type PathWithQuery<P extends string> = `${P}?${string}` | P;

export function withQuery<const P extends string>(
    path: P,
    parameters: Record<string, null | number | string | undefined>,
): PathWithQuery<P> {
    const entries = Object.entries(parameters).filter(
        ([, v]) => v !== undefined && v !== null && v !== '',
    );
    if (entries.length === 0) return path;
    const qs = new URLSearchParams(
        entries.map(([k, v]) => [k, String(v)]),
    ).toString();
    return `${path}?${qs}` as const;
}

export const profileTabs = {
    account: 'account',
    sensorHub: 'sensor-hub',
    sessions: 'sessions',
    tradingPlan: 'trading',
} as const;

export type ProfileTab = (typeof profileTabs)[keyof typeof profileTabs];

export function parseSameOriginRoute(path: string): Route {
    return sameOriginRouteSchema.parse(path);
}

export function profileTabUrl(tab: string): PathWithQuery<'/profile'> {
    return withQuery(routes.profile, { tab });
}

export function sameOriginRoute(pathname: string, query: string): Route {
    return parseSameOriginRoute(
        query === '' ? pathname : `${pathname}?${query}`,
    );
}
