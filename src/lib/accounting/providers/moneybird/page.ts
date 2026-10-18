const FIRST_PAGE = 1;

export class MoneybirdPage {
    static readonly maximumSize = 100;

    static atOffset(offset: number): MoneybirdPage {
        return new this(
            offset / this.maximumSize + FIRST_PAGE,
            this.maximumSize,
        );
    }

    private constructor(
        private readonly number: number,
        private readonly size: number,
    ) {}

    toParams(): Record<string, string> {
        return { page: String(this.number), per_page: String(this.size) };
    }
}
