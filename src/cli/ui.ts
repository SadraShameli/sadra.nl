import chalk from 'chalk';
import ora, { type Ora } from 'ora';

export const ui = {
    fail(message: string): void {
        process.stderr.write(`${chalk.red('✗')} ${message}\n`);
    },
    heading(message: string): void {
        process.stdout.write(`\n${chalk.bold.cyan(message)}\n`);
    },
    muted(message: string): void {
        process.stdout.write(`${chalk.dim(message)}\n`);
    },
    note(message: string): void {
        process.stdout.write(`${chalk.cyan('•')} ${message}\n`);
    },
    spinner(text: string): Ora {
        return ora({ stream: process.stdout, text });
    },
    success(message: string): void {
        process.stdout.write(`${chalk.green('✓')} ${message}\n`);
    },
    warn(message: string): void {
        process.stdout.write(`${chalk.yellow('!')} ${message}\n`);
    },
};
