import { z } from 'zod';

export const SPOTIFY_EMBED_SRC_PREFIX = 'https://open.spotify.com/embed/';

const IFRAME_RE = /^<iframe[\s\S]*?(?:<\/iframe>|\/>)$/i;
const SPOTIFY_SRC_RE =
    /\ssrc=["']https:\/\/open\.spotify\.com\/embed\/[^"']+["']/i;
const DANGEROUS_RE = /<script\b|\son[a-z]+\s*=|javascript:/i;

export const spotifyEmbedHtmlSchema = z
    .string()
    .trim()
    .min(1, 'Paste the iframe HTML from Spotify')
    .max(2048)
    .refine((html) => IFRAME_RE.test(html), {
        message: 'Must be a single <iframe>…</iframe> snippet',
    })
    .refine((html) => SPOTIFY_SRC_RE.test(html), {
        message: `Iframe src must start with ${SPOTIFY_EMBED_SRC_PREFIX}`,
    })
    .refine((html) => !DANGEROUS_RE.test(html), {
        message: 'Scripts and event handlers are not allowed',
    });

export const setSpotifyEmbedHtmlSchema = z.object({
    html: spotifyEmbedHtmlSchema,
});

export type SetSpotifyEmbedHtmlInput = z.infer<
    typeof setSpotifyEmbedHtmlSchema
>;
