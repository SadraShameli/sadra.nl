import 'server-only';

import {
    experienceBSP,
    experienceNobears,
    experienceTrading,
    type PortfolioSectionView,
    projectMinoMarkt,
    projectProjectAI,
    projectSadraNl,
    projectSensorHub,
    projectTradingBot,
    siteContent,
} from '~/lib/site/content';
import { SITE_NAME } from '~/lib/site/siteName';
import { getPublicSiteOrigin } from '~/lib/site/url';

const publicSiteOrigin = getPublicSiteOrigin();
const CODE_PROFILE_URL = 'https://github.com/sadrashameli';

export type CoverLetter = {
    body: string;
    key: string;
    label: string;
};

export type ResumeVariant = {
    experience: PortfolioSectionView[];
    key: ResumeVariantKey;
    label: string;
    projects: PortfolioSectionView[];
    role: string;
    summary: string;
};

export type { ResumeLanguage };

export type ResumeVariantKey = 'fullstack' | 'quant';

type ResumeBasicsData = {
    birth: string;
    hobbies: string[];
    languages: ResumeLanguage[];
    links: { title: string; url: string }[];
    location: string;
    phone: string;
};

type ResumeLanguage = {
    fluency: string;
    title: string;
};

const tradingYears = Math.floor(
    (Date.now() - new Date('2023-03-01').getTime()) /
        (1000 * 60 * 60 * 24 * 365.25),
);

export const resumeContent: ResumeBasicsData = {
    birth: 'Dec 2003',
    hobbies: [
        'Robotics',
        'Photography',
        'Guitar',
        'Cars',
        'Trading',
        'Programming',
    ],
    languages: [
        { fluency: 'Professional Proficiency', title: 'English' },
        { fluency: 'Professional Proficiency', title: 'Dutch' },
        { fluency: 'Native speaker', title: 'Persian' },
    ],
    links: [
        { title: SITE_NAME, url: publicSiteOrigin },
        { title: 'GitHub', url: CODE_PROFILE_URL },
        { title: 'LinkedIn', url: 'https://linkedin.com/in/sadrashameli' },
    ],
    location: 'Rijswijk, The Netherlands',
    phone: '+31 685156033',
};

export const resumeVariants: Record<ResumeVariantKey, ResumeVariant> = {
    fullstack: {
        experience: [experienceNobears, experienceBSP],
        key: 'fullstack',
        label: 'Developer',
        projects: [projectMinoMarkt, projectSensorHub, projectProjectAI],
        role: 'Developer',
        summary:
            'Developer delivering production applications and data platforms. Take projects from system design through implementation, automated testing, deployment and continued maintenance, with professional experience building software for Dutch agency clients.',
    },
    quant: {
        experience: [experienceTrading, experienceNobears, experienceBSP],
        key: 'quant',
        label: 'Daytrader & developer',
        projects: [projectTradingBot, projectSadraNl, projectSensorHub],
        role: 'Daytrader & developer',
        summary: `Futures daytrader and developer with ${tradingYears}+ years focused on NQ futures. Build and operate trading frameworks for backtesting, strategy validation, live execution and risk management, backed by professional experience delivering production applications.`,
    },
};

export const defaultResumeVariantKey: ResumeVariantKey = 'quant';

export const coverLetters: CoverLetter[] = [
    {
        body: `Dear hiring team,

My background combines NQ futures daytrading with the development and operation of trading frameworks. I have ${tradingYears}+ years of trading experience, including multiple payouts from futures prop firms, and I trade my own capital. I am looking for a trading or trading-development role where I can contribute practical market experience and take ownership of the software used to research and execute strategies.

I build and operate modular trading frameworks that run many independent strategies across assets and timeframes. The approach combines small edges that compound over time, with backtesting and validation to test for overfitting. The frameworks cover market data, broker connectivity, live and paper trading, and real-time risk management. Drawdown limits and adaptive position sizing are part of the execution pipeline. I use walk-forward testing and Monte Carlo analysis to examine strategy robustness, alongside Bayesian optimisation and PyTorch for position scoring.

I also bring professional development experience. At Nobears, I build and maintain 15+ production platforms for Dutch clients and have created reusable components and tools that save roughly one to two days on new projects. At Blue Star Planning, I designed connected devices and developed the platform that processed their telemetry, including the team's deployment pipeline. These roles gave me experience taking applications from implementation through deployment and continued maintenance.

I would value a conversation about how this combination of trading and development could contribute to your team. I can walk through my frameworks, their validation processes and the decisions behind their architecture. My projects are available at <strong>${publicSiteOrigin}</strong>, with code at <strong>${CODE_PROFILE_URL}</strong>.

Kind regards,
${siteContent.manifest.name}`,
        key: 'trading',
        label: 'Trading & trading-development roles',
    },
];
