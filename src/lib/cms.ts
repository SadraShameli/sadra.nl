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

export function pageLinkHref(raw: string | null | undefined): string {
    const t = raw?.trim();
    if (!t) return '/resume';
    if (t.startsWith('http://') || t.startsWith('https://')) return t;
    return t.startsWith('/') ? t : `/${t}`;
}
