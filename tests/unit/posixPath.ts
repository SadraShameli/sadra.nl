import path from 'node:path';

export function posixPath(file: string): string {
    return file.split(path.sep).join('/');
}
