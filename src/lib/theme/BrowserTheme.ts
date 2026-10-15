import { apiRoutes } from '~/lib/site/routes';

import { type AppliedTheme, appliedThemeSchema } from './themeSchemas';

const STORAGE_KEY = 'sadra-theme';
const STYLE_ID = 'sadra-theme';
const FONT_ATTRIBUTE = 'data-theme-font';
const FONT_QUERY_PREFIX = `${apiRoutes.themeFontPath}?family=`;

export function applyBrowserTheme(theme: AppliedTheme | null): void {
    if (theme === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
    renderBrowserTheme(theme);
}

export function browserThemeBootScript(): string {
    const constants = JSON.stringify({
        attribute: FONT_ATTRIBUTE,
        key: STORAGE_KEY,
        prefix: FONT_QUERY_PREFIX,
        style: STYLE_ID,
    });
    return `(()=>{const c=${constants};try{const t=JSON.parse(localStorage.getItem(c.key)??'null');if(t===null||typeof t.css!=='string')return;const s=document.createElement('style');s.id=c.style;s.textContent=t.css;document.head.append(s);for(const f of Array.isArray(t.fonts)?t.fonts:[]){if(typeof f!=='string')continue;const l=document.createElement('link');l.rel='stylesheet';l.href=c.prefix+encodeURIComponent(f);l.setAttribute(c.attribute,f);document.head.append(l);}}catch(error){console.warn('Stored theme ignored',error);}})();`;
}

export function storedBrowserTheme(): AppliedTheme | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = appliedThemeSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
}

function renderBrowserTheme(theme: AppliedTheme | null): void {
    const existing = document.querySelector<HTMLStyleElement>(
        `style#${STYLE_ID}`,
    );
    if (theme === null) {
        existing?.remove();
        return;
    }
    const style = existing ?? document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = theme.css;
    if (existing === null) document.head.append(style);
    for (const family of theme.fonts) {
        const selector = `link[${FONT_ATTRIBUTE}="${CSS.escape(family)}"]`;
        if (document.head.querySelector(selector) !== null) continue;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = apiRoutes.themeFont(family);
        link.setAttribute(FONT_ATTRIBUTE, family);
        document.head.append(link);
    }
}
