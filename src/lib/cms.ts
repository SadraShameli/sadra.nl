import { getPayload } from 'payload';
import { cache } from 'react';

import config from '@payload-config';
import type { Homepage, Media, Resume, Site } from '~/payload-types';

export const getSiteGlobal = cache(async (): Promise<Site | null> => {
    const payload = await getPayload({ config });
    return payload.findGlobal({ slug: 'site', depth: 1 });
});

export const getHomepageGlobal = cache(async (): Promise<Homepage | null> => {
    const payload = await getPayload({ config });
    return payload.findGlobal({ slug: 'homepage', depth: 2 });
});

export const getResumeGlobal = cache(async (): Promise<Resume | null> => {
    const payload = await getPayload({ config });
    return payload.findGlobal({ slug: 'resume', depth: 2 });
});

export type ResumeEntryPayload = NonNullable<
    NonNullable<Resume['projects']>[number]
>;

export type ResumeSectionView = {
    title: string;
    role?: string | null;
    date: string;
    url?: string | null;
    location?: { title: string; url?: string | null };
    summary?: string | null;
    highlights?: string[];
    skills?: string[];
    imageUrl?: string;
};

export type ResumeComplete = Resume & {
    projects: NonNullable<Resume['projects']>;
    experience: NonNullable<Resume['experience']>;
    education: NonNullable<Resume['education']>;
};

export function mapResumeEntry(row: ResumeEntryPayload): ResumeSectionView {
    const loc = row.location;
    const locationTitle = loc?.title?.trim();
    return {
        title: row.title,
        role: row.role,
        date: row.date,
        url: row.url?.trim() ? row.url : null,
        location: locationTitle
            ? {
                  title: locationTitle,
                  url: loc?.url?.trim() ? loc.url : null,
              }
            : undefined,
        summary: row.summary,
        highlights: row.highlights?.map((h) => h.text),
        skills: row.skills?.map((s) => s.text),
        imageUrl: isPopulatedMedia(row.image)
            ? mediaUrl(row.image.url)
            : undefined,
    };
}

function isResumeRowComplete(row: ResumeEntryPayload): boolean {
    if (!row.title?.trim() || !row.date?.trim()) return false;
    if (row.image != null && !isPopulatedMedia(row.image)) return false;
    return true;
}

export function isResumeComplete(
    resume: Resume | null,
): resume is ResumeComplete {
    if (!resume) return false;
    if (!resume.metaTitle?.trim() || !resume.metaDescription?.trim()) {
        return false;
    }
    if (
        !resume.projectsSectionTitle?.trim() ||
        !resume.experienceSectionTitle?.trim() ||
        !resume.educationSectionTitle?.trim()
    ) {
        return false;
    }
    const blocks = [resume.projects, resume.experience, resume.education];
    for (const list of blocks) {
        if (!list?.length) return false;
        for (const row of list) {
            if (!isResumeRowComplete(row)) return false;
        }
    }
    return true;
}

export function pageLinkHref(raw: string | null | undefined): string {
    const t = raw?.trim();
    if (!t) {
        return '/resume';
    }
    if (t.startsWith('http://') || t.startsWith('https://')) {
        return t;
    }
    return t.startsWith('/') ? t : `/${t}`;
}

export function mediaUrl(url: string | null | undefined): string {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    const base =
        process.env.NEXT_PUBLIC_SERVER_URL ??
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
    if (!base) return url.startsWith('/') ? url : `/${url}`;
    const path = url.startsWith('/') ? url : `/${url}`;
    return `${base.replace(/\/$/, '')}${path}`;
}

export function isPopulatedMedia(
    field: number | Media | null | undefined,
): field is Media {
    return (
        field != null &&
        typeof field === 'object' &&
        'url' in field &&
        Boolean(field.url)
    );
}

export type HomepageWithMedia = Homepage & {
    heroImage: Media;
    sensorHubVideo: Media;
    recordingDecorVideo: Media;
    aboutSpotifyEmbedUrl: string;
    gallery: NonNullable<Homepage['gallery']>;
};

export function isHomepageComplete(
    homepage: Homepage | null,
): homepage is HomepageWithMedia {
    if (!homepage) return false;
    if (!isPopulatedMedia(homepage.heroImage)) return false;
    if (!isPopulatedMedia(homepage.sensorHubVideo)) return false;
    if (!isPopulatedMedia(homepage.recordingDecorVideo)) return false;
    if (!homepage.aboutSpotifyEmbedUrl?.trim()) return false;
    const gallery = homepage.gallery;
    if (!gallery?.length) return false;
    for (const row of gallery) {
        if (!isPopulatedMedia(row.image)) return false;
    }
    return true;
}

export function isSiteComplete(site: Site | null): site is Site {
    if (!site) return false;
    if (!site.metaTitle?.trim() || !site.metaDescription?.trim()) return false;
    if (!site.navBrand?.trim()) return false;
    if (!site.pageLinks?.resumeUrl?.trim()) return false;
    const links = site.socialLinks;
    if (!links?.length) return false;
    for (const link of links) {
        if (!link.url?.trim()) return false;
    }
    return true;
}
