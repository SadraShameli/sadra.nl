export const routes = {
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
    profile: '/profile',
    propCalculator: '/prop-calculator',
    resume: '/resume',
    tradeChecklist: {
        analytics: '/trade-checklist/analytics',
        calendar: '/trade-checklist/calendar',
        index: '/trade-checklist',
        journal: '/trade-checklist/journal',
        prep: '/trade-checklist/prep',
    },
} as const;

export const apiRoutes = {
    health: '/api/health',
    recording: (id: number | string) => `/api/recording/${id}` as const,
    trpc: '/api/trpc',
} as const;

export const indexableRoutes: readonly string[] = [
    routes.home,
    routes.resume,
    routes.propCalculator,
    routes.contact,
    routes.legal.privacy,
    routes.legal.terms,
    routes.tradeChecklist.index,
    routes.tradeChecklist.journal,
    routes.tradeChecklist.prep,
    routes.tradeChecklist.calendar,
    routes.tradeChecklist.analytics,
];

export const disallowedCrawlPaths: readonly string[] = [
    '/api/',
    routes.profile,
    routes.auth.error,
];

export function withQuery(
    path: string,
    params: Record<string, null | number | string | undefined>,
): string {
    const entries = Object.entries(params).filter(
        ([, v]) => v !== undefined && v !== null && v !== '',
    );
    if (entries.length === 0) return path;
    const qs = new URLSearchParams(
        entries.map(([k, v]) => [k, String(v)]),
    ).toString();
    return `${path}?${qs}`;
}

export const profileTabs = {
    account: 'account',
    sensorHub: 'sensor-hub',
    sessions: 'sessions',
    tradingPlan: 'trading-plan',
} as const;

export type ProfileTab = (typeof profileTabs)[keyof typeof profileTabs];
