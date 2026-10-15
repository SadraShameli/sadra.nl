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
import ProjectAIImage from '~/assets/images/projectai.jpg';
import SadraImage from '~/assets/images/sadra.jpg';
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
            url: 'https://instagram.com/sadra_shml',
        },
    ],
    socialLinks: [
        { platform: 'instagram', url: 'https://instagram.com/sadra_shml' },
        { platform: 'youtube', url: 'https://youtube.com/@sadrashameli' },
    ],
};

export const homepageContent: HomepageData = {
    aboutSectionTitle: 'More about me',
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

export const experienceNobears: PortfolioSectionView = {
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

export const experienceBSP: PortfolioSectionView = {
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

export const projectTradingBot: PortfolioSectionView = {
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

export const projectSadraNl: PortfolioSectionView = {
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

export const projectMinoMarkt: PortfolioSectionView = {
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

export const projectSensorHub: PortfolioSectionView = {
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

export const projectProjectAI: PortfolioSectionView = {
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
