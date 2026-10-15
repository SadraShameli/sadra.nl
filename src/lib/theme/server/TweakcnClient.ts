import 'server-only';
import { z } from 'zod';

import { THEME_ID_PATTERN, type TweakcnTheme } from '~/lib/theme/themeSchemas';
import { ThemeSource } from '~/lib/theme/ThemeSource';
import { normalizeThemeStyles } from '~/lib/theme/ThemeStylesNormalizer';

import {
    InvalidThemeLinkError,
    ThemeNotFoundError,
    TweakcnStaleActionError,
    TweakcnUnavailableError,
} from './ThemeErrors';

const BASE_URL = 'https://tweakcn.com';
const TWEAKCN_HOST = 'tweakcn.com';
const USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const PAGE_SIZE = 50;
const MAX_PAGES = 60;
const REQUEST_TIMEOUT_MS = 20_000;
const CHUNK_BATCH = 6;
const NAME_LIMIT = 80;
const PROSE_DASH = /\s*(?:\u{2014}|\s--\s)\s*/gu;
const ACTION_PATTERN =
    /createServerReference\)\("([0-9a-f]{20,})",[^"]*"getCommunityThemes"/;
const CHUNK_PATTERN = /\/_next\/static\/chunks\/[\w\-./~]+\.js/g;
const THEME_PATH_PATTERN = /\/themes?\/([\w-]+?)(?:\.json)?\/?$/;

const registryItemSchema = z.object({
    cssVars: z
        .object({
            dark: z.unknown(),
            light: z.unknown(),
            theme: z.unknown(),
        })
        .partial()
        .optional(),
    name: z.string(),
    title: z.string().optional(),
});

interface CommunityPage {
    readonly rawCount: number;
    readonly themes: TweakcnTheme[];
}

type RegistryItem = z.infer<typeof registryItemSchema>;

const registrySchema = z.object({ items: z.array(z.unknown()) });

const communityThemeSchema = z.object({
    author: z.object({ name: z.string().nullish() }).nullish(),
    likeCount: z.number().int().nonnegative().nullish(),
    name: z.string(),
    styles: z.object({ dark: z.unknown(), light: z.unknown() }),
    themeId: z.string().regex(THEME_ID_PATTERN),
});

const communityPageSchema = z.object({ themes: z.array(z.unknown()) });

export class TweakcnClient {
    static parseThemeReference(input: string): string {
        const raw = input.trim();
        if (THEME_ID_PATTERN.test(raw)) return raw;
        let url: URL;
        try {
            url = new URL(raw);
        } catch {
            throw new InvalidThemeLinkError();
        }
        if (
            url.hostname !== TWEAKCN_HOST &&
            !url.hostname.endsWith(`.${TWEAKCN_HOST}`)
        )
            throw new InvalidThemeLinkError();
        const id =
            url.searchParams.get('theme') ??
            THEME_PATH_PATTERN.exec(url.pathname)?.[1];
        if (id === undefined || !THEME_ID_PATTERN.test(id))
            throw new InvalidThemeLinkError();
        return id;
    }

    private static fromCommunity(raw: unknown): null | TweakcnTheme {
        const parsed = communityThemeSchema.safeParse(raw);
        if (!parsed.success) return null;
        const styles = normalizeThemeStyles(
            parsed.data.styles.light,
            parsed.data.styles.dark,
        );
        if (styles === null) return null;
        return {
            author:
                parsed.data.author?.name === undefined ||
                parsed.data.author.name === null
                    ? null
                    : themeLabel(parsed.data.author.name),
            id: parsed.data.themeId,
            likes: parsed.data.likeCount ?? null,
            name: themeLabel(parsed.data.name),
            source: ThemeSource.Community,
            styles,
        };
    }

    private static fromRegistry(
        item: RegistryItem,
        id: string,
        source: ThemeSource,
    ): null | TweakcnTheme {
        if (!THEME_ID_PATTERN.test(id)) return null;
        const styles = normalizeThemeStyles(
            item.cssVars?.light,
            item.cssVars?.dark,
            item.cssVars?.theme,
        );
        if (styles === null) return null;
        return {
            author: null,
            id,
            likes: null,
            name: themeLabel(item.title ?? titleFromSlug(item.name)),
            source,
            styles,
        };
    }

    private async discoverActionId(): Promise<string> {
        const html = await this.text(`${BASE_URL}/community`);
        const chunks = [...new Set(html.match(CHUNK_PATTERN))];
        for (let index = 0; index < chunks.length; index += CHUNK_BATCH) {
            const found = await Promise.all(
                chunks
                    .slice(index, index + CHUNK_BATCH)
                    .map((chunk) => this.actionIdIn(chunk)),
            );
            const actionId = found.find((value) => value !== null);
            if (actionId !== undefined) return actionId;
        }
        throw new TweakcnStaleActionError();
    }

    private async actionIdIn(chunk: string): Promise<null | string> {
        const response = await this.request(`${BASE_URL}${chunk}`);
        return response.ok
            ? (ACTION_PATTERN.exec(await response.text())?.[1] ?? null)
            : null;
    }

    private async fetchCommunityPage(
        actionId: string,
        cursor: number,
    ): Promise<CommunityPage> {
        const response = await this.request(`${BASE_URL}/community`, {
            body: JSON.stringify([
                'popular',
                cursor === 0 ? '$undefined' : cursor,
                PAGE_SIZE,
                'all',
                [],
                'all',
            ]),
            headers: {
                Accept: 'text/x-component',
                'Content-Type': 'text/plain;charset=UTF-8',
                'Next-Action': actionId,
            },
            method: 'POST',
        });
        if (response.status === 404) throw new TweakcnStaleActionError();
        if (!response.ok) throw new TweakcnUnavailableError(response.status);
        const body = await response.text();
        const line = body
            .split('\n')
            .find((candidate) => candidate.startsWith('1:'));
        if (line === undefined) throw new TweakcnStaleActionError();
        const page = communityPageSchema.safeParse(JSON.parse(line.slice(2)));
        if (!page.success) throw new TweakcnStaleActionError();
        const themes = page.data.themes
            .map((raw) => TweakcnClient.fromCommunity(raw))
            .filter((theme) => theme !== null);
        return { rawCount: page.data.themes.length, themes };
    }

    private async fetchCommunityPages(
        actionId: string,
    ): Promise<TweakcnTheme[]> {
        const themes: TweakcnTheme[] = [];
        for (let page = 0; page < MAX_PAGES; page++) {
            const batch = await this.fetchCommunityPage(
                actionId,
                page * PAGE_SIZE,
            );
            themes.push(...batch.themes);
            if (batch.rawCount < PAGE_SIZE) break;
        }
        return themes;
    }

    private async request(
        url: string,
        init: RequestInit = {},
    ): Promise<Response> {
        try {
            const headers = new Headers(init.headers);
            headers.set('User-Agent', USER_AGENT);
            return await fetch(url, {
                ...init,
                headers,
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
        } catch (error) {
            throw new TweakcnUnavailableError(
                error instanceof Error ? error.name : 'unreachable',
            );
        }
    }

    private async text(url: string): Promise<string> {
        const response = await this.request(url);
        if (!response.ok) throw new TweakcnUnavailableError(response.status);
        return response.text();
    }

    async fetchCommunity(): Promise<TweakcnTheme[]> {
        let actionId = await this.discoverActionId();
        try {
            return await this.fetchCommunityPages(actionId);
        } catch (error) {
            if (!(error instanceof TweakcnStaleActionError)) throw error;
            actionId = await this.discoverActionId();
            return this.fetchCommunityPages(actionId);
        }
    }

    async fetchPresets(): Promise<TweakcnTheme[]> {
        const registry = registrySchema.parse(
            JSON.parse(await this.text(`${BASE_URL}/r/registry.json`)),
        );
        return registry.items
            .map((item) => registryItemSchema.safeParse(item))
            .map((parsed) =>
                parsed.success
                    ? TweakcnClient.fromRegistry(
                          parsed.data,
                          parsed.data.name,
                          ThemeSource.Preset,
                      )
                    : null,
            )
            .filter((theme) => theme !== null);
    }

    async fetchTheme(id: string): Promise<TweakcnTheme> {
        const response = await this.request(
            `${BASE_URL}/r/themes/${encodeURIComponent(id)}`,
        );
        if (response.status === 404 || response.status === 500)
            throw new ThemeNotFoundError();
        if (!response.ok) throw new TweakcnUnavailableError(response.status);
        const parsed = registryItemSchema.safeParse(
            JSON.parse(await response.text()),
        );
        if (!parsed.success) throw new ThemeNotFoundError();
        const theme = TweakcnClient.fromRegistry(
            parsed.data,
            id,
            ThemeSource.Imported,
        );
        if (theme === null) throw new ThemeNotFoundError();
        return theme;
    }
}

function themeLabel(raw: string): string {
    return raw.replaceAll(PROSE_DASH, ', ').trim().slice(0, NAME_LIMIT);
}

function titleFromSlug(slug: string): string {
    return slug
        .replaceAll('-', ' ')
        .replaceAll(/\b\w/g, (letter) => letter.toUpperCase());
}
