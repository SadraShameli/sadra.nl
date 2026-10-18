import { routes } from '~/lib/site/routes';

export enum FooterVariant {
    Compact = 'compact',
    Full = 'full',
}

export const DEFAULT_FOOTER_VARIANT = FooterVariant.Compact;

const FULL_FOOTER_PATHS: ReadonlySet<string> = new Set([
    routes.home,
    routes.portfolio,
    routes.resume.index,
]);

export function footerVariantFor(pathname: string): FooterVariant {
    return FULL_FOOTER_PATHS.has(pathname)
        ? FooterVariant.Full
        : DEFAULT_FOOTER_VARIANT;
}
