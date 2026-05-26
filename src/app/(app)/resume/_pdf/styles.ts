import { StyleSheet } from '@react-pdf/renderer';

const COLUMN_LABEL_WIDTH = '28%';
const COLUMN_CONTENT_WIDTH = '72%';
const MUTED = '#6b6b6b';
const RULE = '#bfbfbf';

export const styles = StyleSheet.create({
    bullet: {
        marginRight: 4,
    },
    detailLabel: {
        flexShrink: 0,
    },
    detailRule: {
        backgroundColor: RULE,
        flexGrow: 1,
        height: 1,
        marginHorizontal: 6,
        marginTop: 5,
    },
    detailValue: {
        flexShrink: 0,
        fontWeight: 600,
    },
    entry: {
        marginBottom: 10,
    },
    entryMeta: {
        flexDirection: 'row',
        fontSize: 8.5,
        fontWeight: 600,
        justifyContent: 'space-between',
        marginTop: 2,
    },
    entrySummary: {
        lineHeight: 0.85,
        textAlign: 'justify',
    },
    entryTitle: {
        fontSize: 12.5,
        fontWeight: 700,
        lineHeight: 0.85,
        marginBottom: 4,
    },
    entryUrlRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 2,
    },
    gradientBg: {
        height: 900,
        left: -50,
        position: 'absolute',
        top: -50,
        width: 700,
    },
    header: {
        flexDirection: 'row',
        marginBottom: 18,
    },
    headerContent: {
        width: COLUMN_CONTENT_WIDTH,
    },
    headerLabel: {
        alignItems: 'flex-end',
        paddingRight: 18,
        width: COLUMN_LABEL_WIDTH,
    },
    highlightItem: {
        flexDirection: 'row',
        lineHeight: 0.85,
        marginBottom: 2,
        textAlign: 'justify',
    },
    highlightsList: {
        marginTop: 4,
        paddingLeft: 12,
    },
    hobby: {
        fontWeight: 600,
        marginBottom: 4,
    },
    languageBlock: {
        marginRight: 12,
    },
    languageFluency: {
        fontSize: 8.5,
    },
    languagesRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    languageTitle: {
        fontWeight: 600,
    },
    linkText: {
        borderBottomColor: RULE,
        borderBottomStyle: 'dashed',
        borderBottomWidth: 1,
        color: '#000',
        fontWeight: 600,
        textDecoration: 'none',
    },
    meta: {
        color: MUTED,
        fontSize: 8.5,
        marginBottom: 10,
    },
    name: {
        color: '#000',
        fontSize: 22,
        fontWeight: 700,
        marginBottom: 6,
    },
    page: {
        backgroundColor: '#ffffff',
        color: '#000000',
        fontFamily: 'Geist',
        fontSize: 9.5,
        paddingHorizontal: 36,
        paddingVertical: 32,
    },
    profileImage: {
        borderRadius: 48,
        height: 96,
        objectFit: 'cover',
        width: 96,
    },
    section: {
        flexDirection: 'row',
        marginBottom: 14,
    },
    sectionContent: {
        width: COLUMN_CONTENT_WIDTH,
    },
    sectionLabel: {
        color: MUTED,
        fontSize: 8,
        fontWeight: 600,
        textAlign: 'right',
        textTransform: 'uppercase',
    },
    sectionLabelCol: {
        paddingRight: 18,
        width: COLUMN_LABEL_WIDTH,
    },
    skill: {
        fontWeight: 600,
    },
    skillGroup: {
        flexDirection: 'row',
        marginBottom: 3,
    },
    skillGroupItems: {
        flex: 1,
    },
    skillGroupLabel: {
        color: MUTED,
        fontWeight: 600,
        marginRight: 8,
        width: 80,
    },
    skillGroups: {
        flexDirection: 'column',
    },
    skillsLabel: {
        marginRight: 4,
    },
    skillsRow: {
        flexDirection: 'row',
        fontSize: 8.5,
        fontWeight: 600,
        marginTop: 6,
    },
    summary: {
        fontWeight: 600,
        lineHeight: 0.85,
        textAlign: 'justify',
    },
    twoColGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginHorizontal: -6,
    },
    twoColItem: {
        flexDirection: 'row',
        marginBottom: 4,
        paddingHorizontal: 6,
        width: '50%',
    },
});
