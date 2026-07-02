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
    propCalculator: '/prop-calculator',
    resume: {
        index: '/resume',
        pdf: (name: string) => `/resume/${name}/pdf` as const,
        profileImage: (name: string) => `/resume/${name}.jpg` as const,
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
    routes.accounting.index,
    routes.lifting.index,
];

export function withQuery(
    path: string,
    parameters: Record<string, null | number | string | undefined>,
): string {
    const entries = Object.entries(parameters).filter(
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
    tradingPlan: 'trading',
} as const;

export type ProfileTab = (typeof profileTabs)[keyof typeof profileTabs];

export function profileTabUrl(tab: string): string {
    return withQuery(routes.profile, { tab });
}
