import { renderToStream } from '@react-pdf/renderer';
import { notFound } from 'next/navigation';

import { isRoot } from '~/lib/auth/roles';
import { getServerSession } from '~/lib/auth/server';
import { resumeNameSchema, resumeSearchSchema } from '~/lib/schemas/resume';
import {
    coverLetters,
    defaultResumeVariantKey,
    portfolioContent,
    resumeContent,
    resumeVariants,
    siteContent,
} from '~/lib/site/content';
import { routes } from '~/lib/site/routes';
import { getPublicSiteOrigin } from '~/lib/site/url';

import { registerFonts } from '../../_pdf/fonts';
import { ResumeDocument } from '../../_pdf/ResumeDocument';

const cvShow: Record<
    | 'education'
    | 'hobbies'
    | 'languages'
    | 'projectLocations'
    | 'projectSummaries',
    boolean
> = {
    education: false,
    hobbies: false,
    languages: false,
    projectLocations: false,
    projectSummaries: false,
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ name: string }> },
) {
    const parsed = resumeNameSchema.safeParse(await params);
    if (!parsed.success) notFound();
    const { name } = parsed.data;

    const requestUrl = new URL(request.url);
    const { cover, download, variant } = resumeSearchSchema.parse({
        cover: requestUrl.searchParams.get('cover') ?? undefined,
        download: requestUrl.searchParams.get('download') ?? undefined,
        variant: requestUrl.searchParams.get('variant') ?? undefined,
    });

    const session = await getServerSession();
    if (!session?.user.id || !isRoot(session.user.role)) notFound();

    const selectedVariant = resumeVariants[variant ?? defaultResumeVariantKey];
    const selectedCover = cover
        ? coverLetters.find((letter) => letter.key === cover)
        : undefined;
    const showCover = Boolean(selectedCover);

    registerFonts();
    const origin = getPublicSiteOrigin();
    const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1);
    const filename = `${showCover ? 'Cover' : 'Resume'} - ${capitalizedName}.pdf`;

    const cvProjects = selectedVariant.projects.map((project) => ({
        ...project,
        location: cvShow.projectLocations ? project.location : undefined,
        summary: cvShow.projectSummaries ? project.summary : undefined,
    }));

    const stream = await renderToStream(
        <ResumeDocument
            basics={{
                birth: resumeContent.birth,
                email: siteContent.email,
                location: resumeContent.location,
                phone: resumeContent.phone,
                summary: selectedVariant.summary,
                title: siteContent.metaTitle,
            }}
            cover={selectedCover?.body}
            education={cvShow.education ? portfolioContent.education : []}
            experience={selectedVariant.experience}
            hobbies={cvShow.hobbies ? resumeContent.hobbies : []}
            languages={cvShow.languages ? resumeContent.languages : []}
            links={resumeContent.links}
            profilePictureSrc={`${origin}${routes.resume.profileImage(name)}`}
            projects={cvProjects}
            research={[]}
            showCover={showCover}
        />,
    );

    return new Response(stream as unknown as ReadableStream, {
        headers: {
            'cache-control': 'private, no-store',
            'content-disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
            'content-type': 'application/pdf',
        },
    });
}
