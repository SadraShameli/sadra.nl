import { readdirSync, readFileSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { routes } from '~/lib/site/routes';

import { hasPageFile, propCalculatorAppDir } from './appPageFiles';

const TOOLS_ROOT = propCalculatorAppDir('(tools)');
const TOOL_ROUTE_PREFIX = `${routes.propCalculator.index}/`;
const SOURCE_FILE_PATTERN = /\.tsx?$/;
const collapsedTexts = new Map<string, string>();
const sourceFileLists = new Map<string, readonly string[]>();
const sourceTexts = new Map<string, string>();

export function basePath(href: string): string {
    return href.split(/[?#]/, 1)[0] ?? href;
}

export function collapsedSourceText(file: string): string {
    const known = collapsedTexts.get(file);
    if (known !== undefined) return known;
    const collapsed = sourceText(file).replaceAll(/\s+/g, ' ');
    collapsedTexts.set(file, collapsed);
    return collapsed;
}

export function hasToolPage(route: string): boolean {
    return (
        route.startsWith(TOOL_ROUTE_PREFIX) &&
        hasToolPageFile(route.slice(TOOL_ROUTE_PREFIX.length))
    );
}

export async function preloadSourceTexts(root: string): Promise<void> {
    await Promise.all(
        sourceFilesUnder(root)
            .filter((file) => !sourceTexts.has(file))
            .map(async (file) => {
                sourceTexts.set(file, await readFile(file, 'utf8'));
            }),
    );
}

export function sourceFilesUnder(root: string): readonly string[] {
    const known = sourceFileLists.get(root);
    if (known !== undefined) return known;
    const files: string[] = [];
    const walk = (directory: string) => {
        for (const entry of readdirSync(directory)) {
            const full = path.join(directory, entry);
            if (statSync(full).isDirectory()) walk(full);
            else if (SOURCE_FILE_PATTERN.test(entry)) files.push(full);
        }
    };
    walk(root);
    sourceFileLists.set(root, files);
    return files;
}

export function sourceText(file: string): string {
    const known = sourceTexts.get(file);
    if (known !== undefined) return known;
    const text = readFileSync(file, 'utf8');
    sourceTexts.set(file, text);
    return text;
}

export function toolPageRoutes(): string[] {
    return readdirSync(TOOLS_ROOT, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && hasToolPageFile(entry.name))
        .map((entry) => `${TOOL_ROUTE_PREFIX}${entry.name}`);
}

function hasToolPageFile(segment: string): boolean {
    return hasPageFile(TOOLS_ROOT, segment);
}
