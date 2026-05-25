import type { StaticImageData } from 'next/image';

import type { GalleryItem } from '~/app/(app)/_components/GallerySection';

import BSPImage from '~/assets/images/bsp.jpeg';
import DiplomaImage from '~/assets/images/diploma.jpg';
import PorscheImage from '~/assets/images/gallery/porsche.jpg';
import SetupImage from '~/assets/images/gallery/setup.jpg';
import SpainChurchImage from '~/assets/images/gallery/spain-church.jpg';
import SpainPoolImage from '~/assets/images/gallery/spain-pool.jpg';
import MinomarktImage from '~/assets/images/minomarkt.jpeg';
import NobearsImage from '~/assets/images/nobears.jpg';
import SadraImage from '~/assets/images/pictureBar.jpg';
import ProjectAIImage from '~/assets/images/projectai.jpg';
import SensorHubImage from '~/assets/images/units.jpg';

export type PortfolioSectionView = {
    date: string;
    highlights?: string[];
    imageUrl?: string;
    location?: { title: string; url?: null | string };
    role?: null | string;
    skills?: string[];
    summary?: null | string;
    title: string;
    url?: null | string;
};

type HomepageData = {
    aboutSectionTitle: string;
    aboutSpotifyEmbed: string;
    ctaLabel: string;
    gallery: GalleryItem[];
    heroImage: StaticImageData;
    heroSubtitle: string;
    heroTitle: string;
    readingsDescription: string;
    readingsTitle: string;
    recordingDecorVideo: string;
    recordingsDescription: string;
    recordingsTitle: string;
    sensorHubDescription: string;
    sensorHubTitle: string;
    sensorHubVideo: string;
};

type PortfolioData = {
    education: PortfolioSectionView[];
    educationSectionTitle: string;
    experience: PortfolioSectionView[];
    experienceSectionTitle: string;
    heroHeadline: string;
    metaDescription: string;
    metaTitle: string;
    projects: PortfolioSectionView[];
    projectsSectionTitle: string;
};

type SiteData = {
    email: string;
    manifest: SiteManifest;
    metaDescription: string;
    metaTitle: string;
    navBrand: string;
    profiles: SocialProfile[];
    socialLinks: { platform: string; url: string }[];
};

type SiteManifest = {
    description: string;
    name: string;
    shortName: string;
};

type SocialProfile = {
    platform: string;
    title: string;
    url: string;
};

export const siteContent: SiteData = {
    email: 'sadra.shameli1@gmail.com',
    manifest: {
        description: 'Daytrader, developer',
        name: 'Sadra Shameli',
        shortName: 'Sadra',
    },
    metaDescription: 'Daytrader, developer',
    metaTitle: 'Sadra Shameli',
    navBrand: 'sadra',
    profiles: [
        {
            platform: 'youtube',
            title: 'Youtube',
            url: 'https://youtube.com/@sadrashameli',
        },
        {
            platform: 'github',
            title: 'Github',
            url: 'https://github.com/SadraShameli',
        },
        {
            platform: 'whatsapp',
            title: 'WhatsApp',
            url: 'https://wa.me/+31685156033',
        },
        {
            platform: 'instagram',
            title: 'Instagram',
            url: 'https://instagram.com/sadra22._',
        },
    ],
    socialLinks: [
        { platform: 'instagram', url: 'https://instagram.com/sadra22._' },
        { platform: 'youtube', url: 'https://youtube.com/@sadrashameli' },
    ],
};

export const homepageContent: HomepageData = {
    aboutSectionTitle: 'More about me',
    aboutSpotifyEmbed:
        '<iframe style="border-radius:12px" src="https://open.spotify.com/embed/track/4kjI1gwQZRKNDkw1nI475M?utm_source=generator&theme=0" width="100%" height="152" frameBorder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>',
    ctaLabel: 'Portfolio',
    gallery: [
        { alt: 'Spain Pool', src: SpainPoolImage.src },
        { alt: 'Spain Church', src: SpainChurchImage.src },
        { alt: 'Porsche', src: PorscheImage.src },
        { alt: 'PC Setup', src: SetupImage.src },
    ] as GalleryItem[],
    heroImage: SadraImage,
    heroSubtitle: 'Daytrader, developer',
    heroTitle: 'Sadra Shameli',
    readingsDescription:
        'Ever been curious about the temperature, humidity and loudness levels at various locations in real time?',
    readingsTitle: 'Live readings',
    recordingDecorVideo: '/headphone.mp4',
    recordingsDescription:
        'Here you will find a list of noise recordings made by the Sensor Hub devices, which are placed at various locations in the Netherlands.',
    recordingsTitle: 'Noise recordings',
    sensorHubDescription:
        'Devices made by me, designed to record and register various climate telemetry and noise pollution data.',
    sensorHubTitle: 'This is Sensor Hub',
    sensorHubVideo: '/sensorUnit.mp4',
};

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

const experienceNobears: PortfolioSectionView = {
    date: 'Jun 2024 - Present',
    highlights: [
        'Designed reusable component library and faster development processes and tools, saving roughly 1-2 days of work on every new project',
    ],
    imageUrl: NobearsImage.src,
    location: {
        title: 'Rotterdam, The Netherlands',
        url: 'https://www.google.com/maps?um=1&ie=UTF-8&fb=1&gl=nl&sa=X&geocode=Kc3CLHCYNMRHMSJcUppE2IGX&daddr=Goudsesingel+164,+3011+KD+Rotterdam',
    },
    role: 'Full-stack developer',
    skills: [
        'PHP',
        'WordPress',
        'Twig',
        'TypeScript',
        'React',
        'SCSS',
        'MySQL',
        'Redis',
        'Docker',
    ],
    summary: `Full-stack developer building custom WordPress sites and platforms, shipping and maintaining 15+ WordPress platforms for Bram Ladage, Geleidehond, Topbrands, Van der Lelie, PlatformACCT and more.`,
    title: 'Nobears',
    url: 'https://www.nobears.com',
};

const experienceBSP: PortfolioSectionView = {
    date: 'Dec 2021 - Jun 2023 · 1 yr 6 mo',
    highlights: [
        'Set up the Azure DevOps CI/CD pipeline the team continues to ship with',
    ],
    imageUrl: BSPImage.src,
    location: {
        title: 'Rotterdam, The Netherlands',
        url: 'https://goo.gl/maps/v9asMxGqgKwcvwQw5',
    },
    role: 'Full-stack developer',
    skills: ['React', 'TypeScript', 'Next.js', 'ASP.NET', 'SQL', 'C++'],
    summary:
        'Built a full-stack telemetry registering and displaying platform. Designed 3D-printed IoT devices, with a backend that processes the incoming data, and a frontend for visualisation purposes.',
    title: 'Blue Star Planning',
    url: 'https://bluestarplanning.com',
};

const projectTradingBot: PortfolioSectionView = {
    date: 'Sep 2025 - Present',
    highlights: [
        'Running 4 uncorrelated strategies across multiple tickers and timeframes to maximize time and asset diversification for increased ROI and Sharpe',
        'Real-time risk management with drawdown kill switches and adaptive sizing',
        'Strict OOP architecture across layers such as live and paper trader, data source, broker api, cache, notifications, ai optimisation and real-time risk management engine',
        'PyTorch-driven position scoring with chained validators tuned via Bayesian optimisation with strict walk-forward and Monte Carlo validation built around preventing overfitting',
        'Multiprocess, highly concurrent execution pipeline keeping the trading loop very fast with heavy focus on speed',
    ],
    location: {
        title: 'Rijswijk, The Netherlands',
    },
    role: 'Modular quantitative trading framework',
    skills: [
        'Python',
        'PyTorch',
        'NumPy',
        'Pandas',
        'Pydantic',
        'Redis',
        'Docker',
    ],
    summary:
        'Production-grade systematic trading bot, operating autonomously across multiple tickers and timeframes',
    title: 'TradingBot',
    url: 'https://github.com/SadraShameli/TradingBot',
};

const projectSadraNl: PortfolioSectionView = {
    date: 'Mar 2024 - Present',
    highlights: [
        'Trading toolkit covering prop-firm sizing, pre-trade checklists, and a trading journal',
        'Backend and frontend for the Sensor Hub IoT devices, handling configuration, telemetry ingestion, noise recording storage and display',
        'End-to-end type safety from database to UI via tRPC, Zod schema and Drizzle ORM, with Better Auth for sessions and Sentry for production observability',
        'Strict CI with Vitest unit tests and Playwright end-to-end suite catching regressions before every deploy',
        'Multiple integrated apps sharing one auth, API and design system: resume generator, portfolio, trade journal, prop calculator, accounting importer',
    ],
    location: { title: 'Rijswijk, The Netherlands' },
    role: 'Personal site & trading toolkit',
    skills: [
        'TypeScript',
        'Next.js',
        'tRPC',
        'Drizzle',
        'Tailwind CSS',
        'Better Auth',
        'Sentry',
    ],
    summary:
        'Full-stack personal site and trading toolkit hosting my portfolio, resume generator, prop-firm calculator, trade checklist and accounting importer. Also serves as the backend for <strong>Sensor Hub</strong> IoT devices.',
    title: 'sadra.nl',
    url: 'https://sadra.nl',
};

const projectMinoMarkt: PortfolioSectionView = {
    date: 'Nov 2024 - Present',
    highlights: [
        'Custom WooCommerce storefront covering online ordering and in-store pickup',
        'Loyalty program, subscriptions, wishlist, and refund workflows',
        'Strict OOP PHP backend with full type safety and enum usage, with twig based components and blocks.',
        'Customer-facing front end in Bootstrap and TypeScript with Google Maps store locator and live store availability',
    ],
    imageUrl: MinomarktImage.src,
    location: {
        title: 'Alkmaar, The Netherlands',
        url: 'https://maps.app.goo.gl/2c1ZpKjEK1Z5Bg3T7',
    },
    role: 'Persian markt & grill',
    skills: [
        'PHP',
        'WordPress',
        'WooCommerce',
        'Twig',
        'TypeScript',
        'Bootstrap',
        'SCSS',
        'MySQL',
        'Docker',
    ],
    summary:
        'Full-stack WordPress storefront for <strong>Mino Markt & Grill</strong> in Alkmaar, with a custom WooCommerce theme covering loyalty, subscriptions, refunds and order pickup.',
    title: 'Mino Markt',
    url: 'https://minomarkt.nl',
};

const projectSensorHub: PortfolioSectionView = {
    date: 'Feb 2024 - Present',
    highlights: [
        '3 devices currently streaming temperature, humidity, air pressure and loudness data to sadra.nl across the Netherlands',
        'Modular OOP C++ firmware for ESP32 with one task per peripheral communicating through lock-free queues, so sensing, networking and storage run truly in parallel',
        'Sub-100 ms boot in release through multithreading and tight task lifecycles, with heavy focus on performance and reliability',
        'Failsafe layer persisting the last 25 runtime failures for post-mortem analysis, plus encrypted on-device storage keyed off the device MAC',
    ],
    imageUrl: SensorHubImage.src,
    location: { title: 'Rotterdam, The Netherlands' },
    role: 'IoT telemetry devices',
    skills: ['C++', 'ESP32', 'IoT', '3D Printing'],
    summary:
        'Self-designed IoT telemetry devices, 3 currently deployed across the Netherlands, continuously streaming temperature, humidity, air pressure and loudness data back to sadra.nl.',
    title: 'Sensor Hub',
    url: 'https://github.com/SadraShameli/SensorHub',
};

const projectProjectAI: PortfolioSectionView = {
    date: 'Sep 2022 - Dec 2022',
    highlights: [
        'Autonomous driving via TensorFlow on-device inference, navigating a course and avoiding obstacles with no cloud dependency',
        'Multithreaded C++ firmware running sensing, inference and motor control on separate threads to keep the control loop inside real-time budgets',
        'Custom 3D-printed chassis tuned for the sensor and motor layout',
        'Manual override via PS4 / PS5 controller as a safety fallback',
    ],
    imageUrl: ProjectAIImage.src,
    location: { title: 'Delft, The Netherlands' },
    role: 'Self-driving robot',
    skills: ['Python', 'C++', 'Machine Learning', '3D Printing'],
    summary:
        'A self-driving robot on custom 3D-printed hardware, able to follow a course and avoid obstacles on its own.',
    title: 'Project A.I.',
    url: 'https://github.com/SadraShameli/ProjectAI',
};

export const resumeVariants: Record<ResumeVariantKey, ResumeVariant> = {
    fullstack: {
        experience: [experienceNobears, experienceBSP],
        key: 'fullstack',
        label: 'Full-stack developer',
        projects: [
            projectSadraNl,
            projectMinoMarkt,
            projectTradingBot,
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
        label: 'Flow Traders — Digital Assets Trader',
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
        label: 'Coolblue — Banner Developer',
    },
];

export const defaultCoverLetterKey = coverLetters[0]?.key ?? '';

export const portfolioContent: PortfolioData = {
    education: [
        {
            date: 'Sep 2020 - Aug 2023',
            imageUrl: DiplomaImage.src,
            location: {
                title: 'Delft, The Netherlands',
            },
            role: 'VWO - Nature and Technology',
            title: 'Grotius College',
            url: 'https://www.grotiuscollege.nl',
        },
    ] as PortfolioSectionView[],
    educationSectionTitle: 'Education',
    experience: [experienceNobears, experienceBSP],
    experienceSectionTitle: 'Work experience',
    heroHeadline:
        'Full-stack developer and futures daytrader, building high-end WordPress sites and trading tools.',
    metaDescription: 'Daytrader, developer',
    metaTitle: 'Sadra Shameli',
    projects: [
        projectTradingBot,
        projectSadraNl,
        projectMinoMarkt,
        projectSensorHub,
        projectProjectAI,
    ],
    projectsSectionTitle: 'Recent projects',
};
