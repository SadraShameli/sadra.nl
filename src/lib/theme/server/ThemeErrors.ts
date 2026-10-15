export class FontNotFoundError extends Error {
    constructor(family: string) {
        super(`Google Fonts has no ${family}.`);
        this.name = 'FontNotFoundError';
    }
}

export class FontUnavailableError extends Error {
    constructor(family: string) {
        super(`Could not download ${family} from Google Fonts.`);
        this.name = 'FontUnavailableError';
    }
}

export class InvalidThemeLinkError extends Error {
    constructor() {
        super('Paste a tweakcn theme link.');
        this.name = 'InvalidThemeLinkError';
    }
}

export class ThemeNotFoundError extends Error {
    constructor() {
        super('tweakcn has no theme with that link.');
        this.name = 'ThemeNotFoundError';
    }
}

export class TweakcnStaleActionError extends Error {
    constructor() {
        super('tweakcn changed its community list.');
        this.name = 'TweakcnStaleActionError';
    }
}

export class TweakcnUnavailableError extends Error {
    constructor(status: number | string) {
        super(`tweakcn answered ${String(status)}.`);
        this.name = 'TweakcnUnavailableError';
    }
}
