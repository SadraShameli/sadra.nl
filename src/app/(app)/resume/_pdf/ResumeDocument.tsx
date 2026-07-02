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

import {
    type PortfolioSectionView,
    type ResumeLanguage,
} from '~/lib/site/content';

import { styles } from './styles';

export interface ResumeDocumentProps {
    basics: ResumeBasics;
    cover?: string;
    education: PortfolioSectionView[];
    experience: PortfolioSectionView[];
    hobbies: string[];
    languages: ResumeLanguage[];
    links: { title: string; url: string }[];
    profilePictureSrc: string;
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

export function ResumeDocument({
    basics,
    cover,
    education,
    experience,
    hobbies,
    languages,
    links,
    profilePictureSrc,
    projects,
    research,
    showCover,
}: ResumeDocumentProps) {
    const isRenderCover = showCover && Boolean(cover?.length);

    return (
        <Document
            author={basics.title}
            subject="Resume"
            title={`${basics.title} - Resume`}
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
                    profilePictureSrc={profilePictureSrc}
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
                            <Section title="Experience" wrap={true}>
                                {experience.map((entry) => (
                                    <Entry
                                        entry={entry}
                                        key={`${entry.title}-${entry.date}`}
                                    />
                                ))}
                            </Section>
                        )}

                        {research.length > 0 && (
                            <Section title="Research">
                                {research.map((entry) => (
                                    <ResearchEntry
                                        entry={entry}
                                        key={`${entry.title}-${entry.date}`}
                                    />
                                ))}
                            </Section>
                        )}

                        {projects.length > 0 && (
                            <Section title="Projects">
                                {projects.map((entry) => (
                                    <Entry
                                        entry={entry}
                                        key={`${entry.title}-${entry.date}`}
                                    />
                                ))}
                            </Section>
                        )}

                        {education.length > 0 && (
                            <Section title="Education">
                                {education.map((entry) => (
                                    <EducationEntry
                                        entry={entry}
                                        key={`${entry.title}-${entry.date}`}
                                    />
                                ))}
                            </Section>
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

function Header({
    basics,
    hideSummary,
    profilePictureSrc,
}: {
    basics: ResumeBasics;
    hideSummary: boolean;
    profilePictureSrc: string;
}) {
    return (
        <View style={styles.header}>
            <View style={styles.headerLabel}>
                <Image src={profilePictureSrc} style={styles.profileImage} />
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
                if (match) {
                    return (
                        <Text key={index} style={{ fontWeight: 700 }}>
                            {match[1]}
                        </Text>
                    );
                }
                return part.replaceAll(/<[^>]*>/g, '') || null;
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
    if (!location.url) return <Text>{location.title}</Text>;
    return (
        <Link href={location.url} style={styles.linkText}>
            {location.title}
        </Link>
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
