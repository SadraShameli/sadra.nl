import { parseEnum } from '~/lib/utilities';

import { HomeSectionId } from './homeSections';
import { routes } from './routes';

export enum FeaturedProjectId {
    MinoMarkt = 'mino-markt',
    ProjectAI = 'project-ai',
    SensorHub = 'sensor-hub',
    TradingBot = 'trading-bot',
}

export class PortfolioProjectNavigation {
    static readonly defaultProject = FeaturedProjectId.TradingBot;
    private static readonly parameter = 'project';

    static resolve(value: null | string): FeaturedProjectId {
        return parseEnum(FeaturedProjectId, value) ?? this.defaultProject;
    }

    constructor(private readonly search = '') {}

    href(project: FeaturedProjectId) {
        const parameters = new URLSearchParams(this.search);
        parameters.set(PortfolioProjectNavigation.parameter, project);
        return `${routes.home}?${parameters.toString()}#${HomeSectionId.Portfolio}` as const;
    }

    selected(): FeaturedProjectId {
        return PortfolioProjectNavigation.resolve(
            new URLSearchParams(this.search).get(
                PortfolioProjectNavigation.parameter,
            ),
        );
    }
}
