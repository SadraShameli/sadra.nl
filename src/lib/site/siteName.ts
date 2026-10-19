import { getPublicSiteOrigin } from './url';

export const SITE_NAME = new URL(getPublicSiteOrigin()).hostname;
