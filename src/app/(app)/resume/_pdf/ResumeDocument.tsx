import {
    Defs,
    Document,
    Image,
    LinearGradient,
    Link,
    Page,
    Rect,
    Stop,
    Svg,
    Text,
    View,
} from '@react-pdf/renderer';
import { type ComponentType } from 'react';

import { type PortfolioSectionView } from '~/lib/site/content';
import { type ResumeLanguage } from '~/lib/site/resume';

import { styles } from './styles';

export interface ResumeDocumentProperties {
    basics: ResumeBasics;
    cover?: string;
    education: PortfolioSectionView[];
    experience: PortfolioSectionView[];
    hobbies: string[];
    languages: ResumeLanguage[];
    links: { title: string; url: string }[];
    profilePicture: ResumeProfilePicture;
    projects: PortfolioSectionView[];
    research: PortfolioSectionView[];
    showCover: boolean;
}

interface ResumeBasics {
    birth: string;
    email: string;
    location: string;
    phone: string;
    summary: string;
    title: string;
}

interface ResumeProfilePicture {
    readonly data: Buffer;
    readonly format: 'jpg';
}

export function ResumeDocument({
    basics,
    cover,
    education,
    experience,
    hobbies,
    languages,
    links,
    profilePicture,
    projects,
    research,
    showCover,
}: ResumeDocumentProperties) {
    const isRenderCover = showCover && Boolean(cover?.length);
    const documentLabel = isRenderCover ? 'Cover letter' : 'Resume';

    return (
        <Document
            author={basics.title}
            subject={documentLabel}
            title={`${basics.title} - ${documentLabel}`}
        >
            <Page size="A4" style={styles.page} wrap>
                <View fixed style={styles.gradientBg}>
                    <Svg height="900" viewBox="0 0 700 900" width="700">
                        <Defs>
                            <LinearGradient
                                id="bg"
                                x1="0%"
                                x2="100%"
                                y1="0%"
                                y2="0%"
                            >
                                <Stop
                                    offset="0%"
                                    stopColor="#fed7aa"
                                    stopOpacity="0.15"
                                />
                                <Stop
                                    offset="50%"
                                    stopColor="#bfdbfe"
                                    stopOpacity="0.15"
                                />
                                <Stop
                                    offset="100%"
                                    stopColor="#e9d5ff"
                                    stopOpacity="0.15"
                                />
                            </LinearGradient>
                        </Defs>
                        <Rect
                            fill="url(#bg)"
                            height="900"
                            width="700"
                            x="0"
                            y="0"
                        />
                    </Svg>
                </View>
                <Header
                    basics={basics}
                    hideSummary={isRenderCover}
                    profilePicture={profilePicture}
                />

                {isRenderCover ? (
                    <Section title="Cover Letter">
                        <HtmlText style={styles.entrySummary} value={cover} />
                    </Section>
                ) : (
                    <>
                        {links.length > 0 && (
                            <Section title="Links">
                                <View style={styles.twoColGrid}>
                                    {links.map((link) => (
                                        <View
                                            key={link.url}
                                            style={styles.twoColItem}
                                        >
                                            <Link
                                                href={link.url}
                                                style={styles.linkText}
                                            >
                                                {link.url}
                                            </Link>
                                        </View>
                                    ))}
                                </View>
                            </Section>
                        )}

                        {experience.length > 0 && (
                            <EntrySections
                                entries={experience}
                                title="Experience"
                            />
                        )}

                        {research.length > 0 && (
                            <EntrySections
                                component={ResearchEntry}
                                entries={research}
                                title="Research"
                            />
                        )}

                        {projects.length > 0 && (
                            <EntrySections
                                entries={projects}
                                title="Projects"
                            />
                        )}

                        {education.length > 0 && (
                            <EntrySections
                                component={EducationEntry}
                                entries={education}
                                title="Education"
                            />
                        )}

                        {languages.length > 0 && (
                            <Section title="Languages">
                                <View style={styles.languagesRow}>
                                    {languages.map((language) => (
                                        <LanguageBlock
                                            key={language.title}
                                            language={language}
                                        />
                                    ))}
                                </View>
                            </Section>
                        )}

                        {hobbies.length > 0 && (
                            <Section title="Hobbies">
                                <View style={styles.twoColGrid}>
                                    {hobbies.map((hobby) => (
                                        <View
                                            key={hobby}
                                            style={styles.twoColItem}
                                        >
                                            <Text style={styles.hobby}>
                                                {hobby}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            </Section>
                        )}
                    </>
                )}
            </Page>
        </Document>
    );
}

function EducationEntry({ entry }: { entry: PortfolioSectionView }) {
    return (
        <View style={styles.entry}>
            <Text style={styles.entryTitle}>{entry.title}</Text>
            <EntryMeta entry={entry} />
        </View>
    );
}

function Entry({ entry }: { entry: PortfolioSectionView }) {
    return (
        <View style={styles.entry} wrap={false}>
            <Text style={styles.entryTitle}>{entry.title}</Text>
            <EntryMeta entry={entry} />
            {entry.summary && (
                <View style={{ marginTop: 4 }}>
                    <HtmlText
                        style={styles.entrySummary}
                        value={entry.summary}
                    />
                </View>
            )}
            {entry.highlights && entry.highlights.length > 0 && (
                <View style={styles.highlightsList}>
                    {entry.highlights.map((highlight, index) => (
                        <View key={index} style={styles.highlightItem}>
                            <Text style={styles.bullet}>•</Text>
                            <Text>{highlight}</Text>
                        </View>
                    ))}
                </View>
            )}
            {entry.skills && entry.skills.length > 0 && (
                <View style={styles.skillsRow}>
                    <Text style={styles.skillsLabel}>Skills:</Text>
                    <Text>{entry.skills.join(', ')}</Text>
                </View>
            )}
        </View>
    );
}

function EntryMeta({ entry }: { entry: PortfolioSectionView }) {
    return (
        <>
            <View style={styles.entryMeta}>
                <Text>{entry.role ?? ''}</Text>
                <Text>{entry.date}</Text>
            </View>
            {(entry.url ?? entry.location) && (
                <View style={styles.entryUrlRow}>
                    {entry.url ? (
                        <Link href={entry.url} style={styles.linkText}>
                            {entry.url}
                        </Link>
                    ) : (
                        <Text />
                    )}
                    {entry.location && (
                        <LocationLink location={entry.location} />
                    )}
                </View>
            )}
        </>
    );
}

function EntrySections({
    component: EntryComponent = Entry,
    entries,
    title,
}: {
    component?: ComponentType<{ entry: PortfolioSectionView }>;
    entries: readonly PortfolioSectionView[];
    title: string;
}) {
    return entries.map((entry, index) => (
        <Section
            key={`${entry.title}-${entry.date}`}
            title={index === 0 ? title : ''}
            wrap={false}
        >
            <EntryComponent entry={entry} />
        </Section>
    ));
}

function Header({
    basics,
    hideSummary,
    profilePicture,
}: {
    basics: ResumeBasics;
    hideSummary: boolean;
    profilePicture: ResumeProfilePicture;
}) {
    return (
        <View style={styles.header}>
            <View style={styles.headerLabel}>
                <Image src={profilePicture} style={styles.profileImage} />
            </View>
            <View style={styles.headerContent}>
                <View style={styles.meta}>
                    <Text>{basics.location}</Text>
                    <Text>
                        {basics.phone} - {basics.email}
                    </Text>
                </View>
                <Text style={styles.name}>{basics.title}</Text>
                {!hideSummary && (
                    <Text style={styles.summary}>{basics.summary}</Text>
                )}
            </View>
        </View>
    );
}

function HtmlText({
    style,
    value,
}: {
    style: (typeof styles)[keyof typeof styles];
    value: null | string | undefined;
}) {
    if (!value) return null;
    const parts = value.split(/(<strong>[\S\s]*?<\/strong>)/);
    return (
        <Text style={style}>
            {parts.map((part, index) => {
                const match = /^<strong>([\S\s]*?)<\/strong>$/.exec(part);
                return match ? (
                    <Text key={index} style={{ fontWeight: 700 }}>
                        {match[1]}
                    </Text>
                ) : (
                    part.replaceAll(/<[^>]*>/g, '') || null
                );
            })}
        </Text>
    );
}

function LanguageBlock({ language }: { language: ResumeLanguage }) {
    return (
        <View style={styles.languageBlock}>
            <Text style={styles.languageTitle}>{language.title}</Text>
            <Text style={styles.languageFluency}>{language.fluency}</Text>
        </View>
    );
}

function LocationLink({
    location,
}: {
    location: { title: string; url?: null | string };
}) {
    return location.url ? (
        <Link href={location.url} style={styles.linkText}>
            {location.title}
        </Link>
    ) : (
        <Text>{location.title}</Text>
    );
}

function ResearchEntry({ entry }: { entry: PortfolioSectionView }) {
    return (
        <View style={styles.entry}>
            <Text style={styles.entryTitle}>{entry.title}</Text>
            <Text style={styles.entryMeta}>
                {entry.date}
                {entry.location ? `, ${entry.location.title}` : ''}
            </Text>
            {entry.summary && (
                <View style={{ marginTop: 4 }}>
                    <HtmlText
                        style={styles.entrySummary}
                        value={entry.summary}
                    />
                </View>
            )}
        </View>
    );
}

function Section({
    children,
    title,
    wrap = true,
}: {
    children: React.ReactNode;
    title: string;
    wrap?: boolean;
}) {
    return (
        <View style={styles.section} wrap={wrap}>
            <View style={styles.sectionLabelCol}>
                <Text style={styles.sectionLabel}>{title}</Text>
            </View>
            <View style={styles.sectionContent}>{children}</View>
        </View>
    );
}
