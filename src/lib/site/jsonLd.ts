export function serializeJsonLd(value: object): string {
    return JSON.stringify(value).replaceAll('<', String.raw`\u003c`);
}
