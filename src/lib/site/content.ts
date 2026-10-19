import type { Route } from 'next';
import type { StaticImageData } from 'next/image';

import { type UrlObject } from 'node:url';

import BSPImage from '~/assets/images/bsp.jpeg';
import DiplomaImage from '~/assets/images/diploma.jpg';
import CoastalSunsetImage from '~/assets/images/gallery/coastal-sunset.jpg';
import EveningLoungeImage from '~/assets/images/gallery/evening-lounge.jpg';
import PorscheImage from '~/assets/images/gallery/porsche.jpg';
import RooftopTerraceImage from '~/assets/images/gallery/rooftop-terrace.jpg';
import SetupImage from '~/assets/images/gallery/setup.jpg';
import SpainChurchImage from '~/assets/images/gallery/spain-church.jpg';
import SpainPoolImage from '~/assets/images/gallery/spain-pool.jpg';
import SunnyBenchImage from '~/assets/images/gallery/sunny-bench.jpg';
import MinomarktImage from '~/assets/images/minomarkt.jpeg';
import NobearsImage from '~/assets/images/nobears.jpg';
import ProjectAIImage from '~/assets/images/projectai.jpg';
import SensorHubImage from '~/assets/images/units.jpg';

import { routes } from './routes';
import { SITE_NAME } from './siteName';
import { getPublicSiteOrigin, type PublicSiteOrigin } from './url';

export enum HeroMode {
    Developer = 'developer',
    Trader = 'trader',
}

export enum PortfolioSectionId {
    Education = 'education',
    Experience = 'experience',
    Projects = 'projects',
}

export enum SensorMetric {
    Humidity = 'humidity',
    Loudness = 'loudness',
    Temperature = 'temperature',
}

export enum ToolTicker {
    Checklist = '$CHKL',
    Lifting = '$LIFT',
    Portfolio = '$PORT',
    PropCalculator = '$PROP',
}

export interface CaptionedPhoto {
    readonly alt: string;
    readonly caption: string;
    readonly image: StaticImageData;
    readonly tag: string;
}

export interface EmphasisHeading {
    readonly after?: string;
    readonly before?: string;
    readonly emphasis: string;
    readonly stacked?: boolean;
}

export type ExternalUrl = `https://${string}`;

export interface HeroModeCopy {
    readonly punctuation: string;
    readonly word: string;
}

export interface LoopingVideo {
    readonly poster: string;
    readonly src: string;
}

export interface PortfolioSection {
    readonly entries: readonly PortfolioSectionView[];
    readonly eyebrow: string;
    readonly heading: EmphasisHeading;
    readonly id: PortfolioSectionId;
    readonly number: string;
}

export type PortfolioSectionView = {
    date: string;
    highlights?: string[];
    imageUrl?: string;
    location?: { title: string; url?: ExternalUrl | null };
    role?: null | string;
    skills?: string[];
    summary?: null | string;
    title: string;
    url?: ExternalUrl | null | PublicSiteOrigin;
};

export interface SensorMetricCopy {
    readonly label: string;
    readonly metric: SensorMetric;
    readonly unit: string;
}

export interface SiteTool {
    readonly description: string;
    readonly href: Route;
    readonly shortTitle: string;
    readonly sparkline: string;
    readonly ticker: ToolTicker;
    readonly title: string;
}

type HomepageData = {
    readonly about: {
        readonly gallery: readonly CaptionedPhoto[];
        readonly heading: EmphasisHeading;
        readonly spotifyEmbedUrl: ExternalUrl;
        readonly spotifyLabel: string;
    };
    readonly closing: {
        readonly body: string;
        readonly contactLabel: string;
        readonly directMessageLabel: string;
        readonly eyebrow: string;
        readonly heading: EmphasisHeading;
        readonly madeBy: string;
        readonly marquee: readonly string[];
    };
    readonly hero: {
        readonly garage: {
            readonly alt: string;
            readonly caption: string;
            readonly tag: string;
        };
        readonly modes: Readonly<Record<HeroMode, HeroModeCopy>>;
        readonly payout: {
            readonly date: string;
            readonly firm: string;
        };
        readonly profitAndLoss: {
            readonly label: string;
        };
    };
    readonly live: {
        readonly body: string;
        readonly heading: EmphasisHeading;
    };
    readonly metaTitle: string;
    readonly recordings: {
        readonly body: string;
        readonly decorChip: string;
        readonly decorVideo: LoopingVideo;
        readonly heading: EmphasisHeading;
    };
    readonly sensorHub: {
        readonly body: string;
        readonly heading: EmphasisHeading;
        readonly linkLabel: string;
        readonly metrics: readonly SensorMetricCopy[];
        readonly video: LoopingVideo;
        readonly videoChip: string;
    };
    readonly tools: {
        readonly body: string;
        readonly heading: EmphasisHeading;
    };
};

type PortfolioData = {
    education: PortfolioSectionView[];
    experience: PortfolioSectionView[];
    heroHeading: EmphasisHeading;
    heroHeadline: string;
    metaDescription: string;
    metaTitle: string;
    projects: PortfolioSectionView[];
    sections: readonly PortfolioSection[];
};

type SiteData = {
    email: string;
    manifest: SiteManifest;
    metaDescription: string;
    metaTitle: string;
    profiles: SocialProfile[];
    socialLinks: {
        platform: string;
        title: string;
        url: ExternalUrl;
    }[];
};

type SiteManifest = {
    description: string;
    name: string;
    shortName: string;
};

type SocialProfile = {
    platform: string;
    title: string;
    url: ExternalUrl;
};

export function portfolioSectionHref(id: PortfolioSectionId): UrlObject {
    return { hash: id, pathname: routes.portfolio };
}

const SITE_OWNER_NAME = 'Sadra Shameli';

export const siteContent: SiteData = {
    email: 'sadra.shameli1@gmail.com',
    manifest: {
        description: 'Daytrader, developer',
        name: SITE_OWNER_NAME,
        shortName: 'Sadra',
    },
    metaDescription: `${SITE_OWNER_NAME} is a futures daytrader and developer in the Netherlands. Explore his trading tools, prop firm calculators and personal projects.`,
    metaTitle: SITE_OWNER_NAME,
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
        {
            platform: 'instagram',
            title: 'Instagram',
            url: 'https://instagram.com/sadra_shml',
        },
        {
            platform: 'youtube',
            title: 'YouTube',
            url: 'https://youtube.com/@sadrashameli',
        },
    ],
};

class UnknownSiteToolError extends Error {
    constructor(ticker: ToolTicker) {
        super(`No site tool is registered for ${ticker}`);
        this.name = 'UnknownSiteToolError';
    }
}

export function siteTool(ticker: ToolTicker): SiteTool {
    const tool = siteTools.find((entry) => entry.ticker === ticker);
    if (tool === undefined) throw new UnknownSiteToolError(ticker);
    return tool;
}

export function siteToolTitle(ticker: ToolTicker): string {
    return siteTool(ticker).title;
}

export const siteTools: readonly SiteTool[] = [
    {
        description: 'Run the numbers on a challenge before you pay for it.',
        href: routes.propCalculator.index,
        shortTitle: 'Prop calculator',
        sparkline: '0,38 20,34 40,36 60,26 80,30 100,18 120,22 140,12 160,8',
        ticker: ToolTicker.PropCalculator,
        title: 'Prop firm calculator',
    },
    {
        description:
            'Every rule ticked off before an entry. No checklist, no trade.',
        href: routes.tradeChecklist.index,
        shortTitle: 'Trade checklist',
        sparkline: '0,30 20,28 40,30 60,24 80,24 100,20 120,18 140,16 160,14',
        ticker: ToolTicker.Checklist,
        title: 'Trade checklist',
    },
    {
        description:
            'Sets, reps and progress from the gym, logged in one place.',
        href: routes.lifting.index,
        shortTitle: 'Lifting tracker',
        sparkline: '0,42 20,40 40,36 60,36 80,28 100,26 120,18 140,16 160,6',
        ticker: ToolTicker.Lifting,
        title: 'Lifting tracker',
    },
    {
        description: 'My trading portfolio, laid out in the open.',
        href: routes.portfolio,
        shortTitle: 'Portfolio',
        sparkline: '0,20 20,30 40,24 60,34 80,22 100,26 120,14 140,20 160,10',
        ticker: ToolTicker.Portfolio,
        title: 'Portfolio',
    },
];

export const homepageContent: HomepageData = {
    about: {
        gallery: [
            {
                alt: 'Sitting on a wooden bench in the sunshine',
                caption: 'A moment in the sun',
                image: SunnyBenchImage,
                tag: 'Outdoors',
            },
            {
                alt: 'Sitting on a rooftop terrace overlooking the city and mountains',
                caption: 'Rooftop drinks',
                image: RooftopTerraceImage,
                tag: 'Rooftop',
            },
            {
                alt: 'Watching the sunset over the coast from a terrace',
                caption: 'Sunset by the sea',
                image: CoastalSunsetImage,
                tag: 'Coast',
            },
            {
                alt: 'Relaxing on a lounge sofa with drinks in the evening',
                caption: 'An evening out',
                image: EveningLoungeImage,
                tag: 'Evening',
            },
            {
                alt: 'A pool in Spain',
                caption: 'The pool',
                image: SpainPoolImage,
                tag: 'Spain',
            },
            {
                alt: 'A church in Spain',
                caption: 'The church',
                image: SpainChurchImage,
                tag: 'Spain',
            },
            {
                alt: 'The Porsche in the garage',
                caption: 'The Porsche',
                image: PorscheImage,
                tag: 'Garage',
            },
            {
                alt: 'The desk setup with trading screens',
                caption: 'The setup',
                image: SetupImage,
                tag: 'Desk',
            },
        ],
        heading: { before: 'Who I am', emphasis: ', and some photography' },
        spotifyEmbedUrl:
            'https://open.spotify.com/embed/track/0BxE4FqsDD1Ot4YuBXwAPp?theme=0',
        spotifyLabel: 'On repeat',
    },
    closing: {
        body: 'Markets keep hours. I don’t. A question about a tool, a spot for a Sensor Hub, or just something to say.',
        contactLabel: 'Get in touch',
        directMessageLabel: 'Send a DM',
        eyebrow: 'After the bell',
        heading: { before: 'Let’s', emphasis: 'talk.', stacked: true },
        madeBy: 'Designed and built by me in the Netherlands',
        marquee: ['Daytrader', 'Developer'],
    },
    hero: {
        garage: {
            alt: 'A line drawing of a modern hypercar under a spotlight',
            caption: 'The garage',
            tag: 'No. 01',
        },
        modes: {
            [HeroMode.Developer]: {
                punctuation: '.',
                word: 'developer',
            },
            [HeroMode.Trader]: {
                punctuation: ',',
                word: 'Daytrader',
            },
        },
        payout: {
            date: '[ Date ]',
            firm: '[ Prop firm ]',
        },
        profitAndLoss: {
            label: 'Today’s P&L',
        },
    },
    live: {
        body: 'Ever been curious about the temperature, humidity and loudness at different spots measured by Sensor Hub in real time?',
        heading: { before: 'Live', emphasis: 'readings' },
    },
    metaTitle: `${SITE_OWNER_NAME} | Daytrader & Developer`,
    recordings: {
        body: 'Recorded by Sensor Hub devices placed at locations across the Netherlands. Put your headphones on.',
        decorChip: 'Headphones on',
        decorVideo: {
            poster: '/headphone-poster.webp',
            src: '/headphone.mp4',
        },
        heading: { before: 'Noise', emphasis: 'recordings.', stacked: true },
    },
    sensorHub: {
        body: 'Devices made by me, designed to record and register climate telemetry and noise pollution data.',
        heading: { before: 'This is', emphasis: 'Sensor Hub.', stacked: true },
        linkLabel: 'See the live readings',
        metrics: [
            {
                label: 'Temperature',
                metric: SensorMetric.Temperature,
                unit: '°C',
            },
            { label: 'Humidity', metric: SensorMetric.Humidity, unit: '%RH' },
            { label: 'Loudness', metric: SensorMetric.Loudness, unit: 'dB' },
        ],
        video: {
            poster: '/sensorUnit-poster.webp',
            src: '/sensorUnit.mp4',
        },
        videoChip: 'Unit 01 · Handmade',
    },
    tools: {
        body: 'Tools I built because I needed them: for the trading day, the gym and the portfolio.',
        heading: { before: 'The', emphasis: 'toolkit' },
    },
};

export const experienceNobears: PortfolioSectionView = {
    date: 'Jun 2024 - Present',
    highlights: [
        'Build and maintain 15+ production websites and platforms for Dutch agency clients',
        'Created reusable components and development tools that save roughly 1-2 days on each new project',
    ],
    imageUrl: NobearsImage.src,
    location: {
        title: 'Rotterdam, The Netherlands',
        url: 'https://www.google.com/maps?um=1&ie=UTF-8&fb=1&gl=nl&sa=X&geocode=Kc3CLHCYNMRHMSJcUppE2IGX&daddr=Goudsesingel+164,+3011+KD+Rotterdam',
    },
    role: 'Developer',
    skills: [
        'PHP',
        'Twig',
        'TypeScript',
        'React',
        'SCSS',
        'MySQL',
        'Redis',
        'Docker',
    ],
    summary:
        'Develop and maintain production applications for clients including Bram Ladage, Geleidehond, Topbrands, Van der Lelie and PlatformACCT.',
    title: 'Nobears',
    url: 'https://www.nobears.com',
};

export const experienceBSP: PortfolioSectionView = {
    date: 'Dec 2021 - Jun 2023 · 1 yr 6 mo',
    highlights: [
        'Designed 3D-printed IoT devices and built an ASP.NET platform to collect, process and display their telemetry',
        "Set up the team's Azure DevOps pipeline for continuous integration and deployment",
    ],
    imageUrl: BSPImage.src,
    location: {
        title: 'Rotterdam, The Netherlands',
        url: 'https://goo.gl/maps/v9asMxGqgKwcvwQw5',
    },
    role: 'Developer',
    skills: ['React', 'TypeScript', 'Next.js', 'ASP.NET', 'SQL', 'C++'],
    summary:
        'Developed connected devices and the software used to process and visualise their sensor data.',
    title: 'Blue Star Planning',
    url: 'https://bluestarplanning.com',
};

export const projectTradingBot: PortfolioSectionView = {
    date: 'Sep 2025 - Present',
    highlights: [
        'Built a modular Python framework for live and paper trading, with separate data, broker and risk-management components',
        'Operate many independent strategies across assets and timeframes, built around small edges that compound over time and backtested to avoid overfitting',
        'Validate strategies with walk-forward testing and Monte Carlo analysis, using Bayesian optimisation and PyTorch for position scoring',
        'Use multiprocessing and caching to support concurrent data processing and execution',
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
        'A systematic trading framework used to research strategies and operate live trading across assets and timeframes.',
    title: 'TradingBot',
    url: 'https://github.com/SadraShameli/TradingBot',
};

export const experienceTrading: PortfolioSectionView = {
    date: 'Mar 2023 - Present',
    highlights: [
        'Trade NQ futures, with multiple payouts from futures prop firms',
        'Operate many independent strategies across assets and timeframes, combining small compounding edges with backtesting and validation against overfitting',
    ],
    location: { title: 'Rijswijk, The Netherlands' },
    role: 'Futures daytrader',
    skills: ['NQ futures', 'Risk management', 'Strategy research', 'Python'],
    summary:
        'Independent futures daytrader with experience in prop-firm evaluations, funded trading and trading my own capital.',
    title: 'Independent trading',
    url: projectTradingBot.url,
};

export const projectSadraNl: PortfolioSectionView = {
    date: 'Mar 2024 - Present',
    highlights: [
        'Built futures prop-firm tools for Monte Carlo simulation, position sizing and payout planning',
        'Integrated a trading journal, pre-trade checklists and account tools behind a shared typed API and permissions model',
        'Maintain automated checks with Vitest and Playwright across application behaviour and trading-rule logic',
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
        'Personal site and trading toolkit hosting my portfolio, resume generator, prop-firm calculator, trade checklist and accounting importer. Also serves as the platform for <strong>Sensor Hub</strong> IoT devices.',
    title: SITE_NAME,
    url: getPublicSiteOrigin(),
};

export const projectMinoMarkt: PortfolioSectionView = {
    date: 'Nov 2024 - Present',
    highlights: [
        'Custom WooCommerce storefront covering online ordering and in-store pickup',
        'Loyalty program, subscriptions, wishlist, and refund workflows',
        'Strict OOP PHP backend with full type safety and enum usage, with twig based components and blocks.',
        'Customer application in Bootstrap and TypeScript with Google Maps store locator and live store availability',
    ],
    imageUrl: MinomarktImage.src,
    location: {
        title: 'Alkmaar, The Netherlands',
        url: 'https://maps.app.goo.gl/2c1ZpKjEK1Z5Bg3T7',
    },
    role: 'Persian markt & grill',
    skills: [
        'PHP',
        'WooCommerce',
        'Twig',
        'TypeScript',
        'Bootstrap',
        'SCSS',
        'MySQL',
        'Docker',
    ],
    summary:
        'Custom storefront for <strong>Mino Markt & Grill</strong> in Alkmaar, covering loyalty, subscriptions, refunds and order pickup.',
    title: 'Mino Markt',
    url: 'https://minomarkt.nl',
};

export const projectSensorHub: PortfolioSectionView = {
    date: 'Feb 2024 - Present',
    highlights: [
        'Deployed three ESP32 telemetry devices across the Netherlands, streaming environmental readings to a shared platform',
        'Built concurrent C++ firmware with boot times below 100 ms in release builds and persistent failure diagnostics',
    ],
    imageUrl: SensorHubImage.src,
    location: { title: 'Rotterdam, The Netherlands' },
    role: 'IoT telemetry devices',
    skills: ['C++', 'ESP32', 'IoT', '3D Printing'],
    summary: `Self-designed IoT telemetry devices, 3 currently deployed across the Netherlands, continuously streaming temperature, humidity, air pressure and loudness data back to ${SITE_NAME}.`,
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

const portfolioEducation: PortfolioSectionView[] = [
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
];

const portfolioExperience: PortfolioSectionView[] = [
    experienceTrading,
    experienceNobears,
    experienceBSP,
];

const portfolioProjects: PortfolioSectionView[] = [
    projectTradingBot,
    projectSadraNl,
    projectMinoMarkt,
    projectSensorHub,
    projectProjectAI,
];

export const portfolioContent: PortfolioData = {
    education: portfolioEducation,
    experience: portfolioExperience,
    heroHeading: { before: 'Selected', emphasis: 'work' },
    heroHeadline:
        'Futures daytrader and developer, focused on the markets and building tools for trading, strategy analysis and risk management.',
    metaDescription: `${SITE_OWNER_NAME} is a futures daytrader and developer. Explore his trading frameworks, prop firm calculators and tools for analysis and risk management.`,
    metaTitle: 'Portfolio',
    projects: portfolioProjects,
    sections: [
        {
            entries: portfolioExperience,
            eyebrow: 'Experience',
            heading: { before: 'Work', emphasis: 'experience' },
            id: PortfolioSectionId.Experience,
            number: '01',
        },
        {
            entries: portfolioProjects,
            eyebrow: 'Projects',
            heading: { before: 'Recent', emphasis: 'projects' },
            id: PortfolioSectionId.Projects,
            number: '02',
        },
        {
            entries: portfolioEducation,
            eyebrow: 'Education',
            heading: { emphasis: 'Education' },
            id: PortfolioSectionId.Education,
            number: '03',
        },
    ],
};
