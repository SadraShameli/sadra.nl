import { type UrlObject } from 'node:url';

import { routes } from './routes';

export enum HomeSectionId {
    About = 'about',
    Portfolio = 'portfolio',
    Readings = 'readings',
    Recordings = 'recordings',
    SensorHub = 'sensor-hub',
    Tools = 'tools',
}

export interface HomeSection {
    readonly eyebrow: string;
    readonly id: HomeSectionId;
    readonly indexLabel: string;
    readonly navLabel: string;
    readonly number: string;
}

export const HOME_SECTIONS: readonly HomeSection[] = [
    {
        eyebrow: 'Toolkit',
        id: HomeSectionId.Tools,
        indexLabel: 'Tools',
        navLabel: 'Tools',
        number: '01',
    },
    {
        eyebrow: 'Hardware',
        id: HomeSectionId.SensorHub,
        indexLabel: 'Sensor Hub',
        navLabel: 'Sensor Hub',
        number: '02',
    },
    {
        eyebrow: 'Data',
        id: HomeSectionId.Readings,
        indexLabel: 'Live readings',
        navLabel: 'Readings',
        number: '03',
    },
    {
        eyebrow: 'Audio',
        id: HomeSectionId.Recordings,
        indexLabel: 'Recordings',
        navLabel: 'Recordings',
        number: '04',
    },
    {
        eyebrow: 'Portfolio',
        id: HomeSectionId.Portfolio,
        indexLabel: 'Portfolio',
        navLabel: 'Portfolio',
        number: '05',
    },
    {
        eyebrow: 'Off the clock',
        id: HomeSectionId.About,
        indexLabel: 'About',
        navLabel: 'About',
        number: '06',
    },
];

export const FOOTER_SECTION_NUMBER = '07';

export class UnknownHomeSectionError extends Error {
    constructor(id: string) {
        super(`No homepage section is registered for "${id}"`);
        this.name = 'UnknownHomeSectionError';
    }
}

export function homeSection(id: HomeSectionId): HomeSection {
    const section = HOME_SECTIONS.find((entry) => entry.id === id);
    if (section === undefined) throw new UnknownHomeSectionError(id);
    return section;
}

export function homeSectionHref(id: HomeSectionId): UrlObject {
    return { hash: id, pathname: routes.home };
}
