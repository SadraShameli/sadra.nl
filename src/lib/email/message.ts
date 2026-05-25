export abstract class EmailMessage {
    abstract readonly subject: string;
    abstract readonly to: string;
    abstract render(): Promise<string>;
}
