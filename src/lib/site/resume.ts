import 'server-only';

import {
    experienceBSP,
    experienceNobears,
    type PortfolioSectionView,
    projectMinoMarkt,
    projectProjectAI,
    projectSadraNl,
    projectSensorHub,
    projectTradingBot,
} from '~/lib/site/content';

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
        { title: 'sadra.nl', url: 'https://sadra.nl' },
        { title: 'Github', url: 'https://github.com/sadrashameli' },
        { title: 'Youtube', url: 'https://youtube.com/@sadrashameli' },
        { title: 'Linkedin', url: 'https://linkedin.com/in/sadrashameli' },
    ],
    location: 'Rijswijk, The Netherlands',
    phone: '+31 685156033',
};

export const resumeVariants: Record<ResumeVariantKey, ResumeVariant> = {
    fullstack: {
        experience: [experienceNobears, experienceBSP],
        key: 'fullstack',
        label: 'Full-stack developer',
        projects: [
            projectTradingBot,
            projectSadraNl,
            projectMinoMarkt,
            projectSensorHub,
            projectProjectAI,
        ],
        role: 'Full-stack developer',
        summary: `Full-stack developer with 4 years of experience shipping production WordPress and Next.js platforms for Dutch agencies. Looking to bring this end-to-end technical ownership and architectural discipline to a product-focused engineering team.`,
    },
    quant: {
        experience: [experienceNobears, experienceBSP],
        key: 'quant',
        label: 'Trading engineer',
        projects: [
            projectTradingBot,
            projectSadraNl,
            projectMinoMarkt,
            projectSensorHub,
            projectProjectAI,
        ],
        role: 'Trading engineer',
        summary: `Software engineer and futures trader with ${tradingYears}+ years in NQ futures and multiple prop firm payouts in the last year. Currently running my own capital through a modular Python trading framework I built. Looking to bring this combination of trading discipline and engineering ownership.`,
    },
};

export const defaultResumeVariantKey: ResumeVariantKey = 'fullstack';

export const coverLetters: CoverLetter[] = [
    {
        body: `Dear hiring team,

I have ${tradingYears}+ years of focused trading experience in NQ futures, including multiple payouts from futures prop firms in the last year. To automate what works, I have spent the past year building a modular quantitative trading framework from scratch. My main focus has been preventing overfitting, and building this system taught me firsthand that the difference between a theoretical strategy and one that actually survives the market is entirely in the engineering underneath it.

Since September 2025, I have been running my own capital through this system, trading four uncorrelated strategies across different assets and timeframes for maximum diversification. I built a strict object oriented architecture to be able to easily add more features, structured as discrete layers: a data layer with multiple persistent storage backends, a cache layer on the hot paths for maximum performance with support for memory and Redis, a broker layer behind a unified API, an optimisation layer, real time risk management, and a notification and communication layer for live alerts.

Because execution speed and throughput are critical, I am deeply focused on micro performance optimizations. The system is designed to be highly concurrent, heavily utilizing multi processing and threading to ensure the pipeline never bottlenecks. For position scoring, the engine leverages PyTorch, backed by strict walk forward cross validation, Monte Carlo analysis, and automated risk management.

Alongside my trading engine, I bring four years of experience in C++, Python, SQL, TypeScript, React, Next.js, Tailwind, and WordPress. Whether I am shipping websites in my current role at Nobears Rotterdam or building firmware to dashboard stacks at my previous IoT startup, I am highly comfortable with complex exchange APIs, latency sensitive code, and owning a project end to end.

The combination of my trading experience, trading bot, professional experience and the ability to learn very quickly positions me perfectly to collaborate across your teams. I would welcome the chance to talk about how I can contribute to the team. My code and projects can be found at <strong>https://sadra.nl</strong> and <strong>https://github.com/SadraShameli</strong>.

Kind regards,
Sadra Shameli`,
        key: 'flowtraders',
        label: 'Flow Traders, Digital Assets Trader',
    },
    {
        body: `Rijswijk, 21 juni 2024

Betref: Banner Developer bij Coolblue

Geachte heer/mevrouw,

Deze week kwam ik op Linkedin uw vacature tegen voor Banner Developer bij Coolblue. De vacature sprak mij direct aan, aangezien deze perfect aansluit bij mijn passie voor webontwikkeling. Hierdoor besloot ik om deze motivatiebrief te schrijven. Ik leg u graag uit wat mij zo aanspreekt in deze functie en hoe ik een toegevoegde waarde kan zijn voor Coolblue.

Als een kandidaat met ervaring in full-stack development met Typescript, React.js en TailwindCSS op zakelijk niveau, heb ik vol vertrouwen dat ik uitstekend zou passen in deze rol.

Tijdens mijn werkperiode bij Blue Star Planning B.V. was ik verantwoordelijk voor een full-stack project waarbij ik IoT-devices ontwierp. Daarnaast ontwikkelde ik een backend met ASP.NET en Entity Framework om de data te kunnen verwerken en opslaan. Vervolgens had ik een frontend gemaakt met Typescript, React.js en TailwindCSS voor het weergeven van de data.

Voor een persoonlijk project heb ik de backend volledig gemigreerd naar Next.js en Drizzle, aangezien dit kosteneffectiever was. Het project kunt u terugvinden op mijn website: https://sadra.nl

Verder kunt u mijn GitHub profiel bekijken om meer te weten over mijn projecten en mijn programmeerstijl: https://github.com/sadrashameli

Ik kijk graag uit naar de volgende stappen in het sollicitatieproces en een kennismakingsgesprek.

Hartelijk dank voor uw tijd en aandacht.

Met vriendelijke groet,
Sadra Shameli`,
        key: 'coolblue',
        label: 'Coolblue, Banner Developer',
    },
];
