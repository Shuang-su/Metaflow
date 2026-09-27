import { readFile } from 'node:fs/promises';
export const sources = (...names) =>
    Promise.all(names.map((name) => readFile(new URL('../src/' + name, import.meta.url), 'utf8')));
