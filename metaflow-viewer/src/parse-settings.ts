const stripJsonComments = (source: string) => {
    let result = '';
    let inString = false;
    let stringQuote = '"';
    let escapeNext = false;
    let lineComment = false;
    let blockComment = false;

    for (let i = 0; i < source.length; i++) {
        const char = source[i];
        const next = source[i + 1];

        if (lineComment) {
            if (char === '\n' || char === '\r') {
                lineComment = false;
                result += char;
            }
            continue;
        }

        if (blockComment) {
            if (char === '*' && next === '/') {
                blockComment = false;
                i++;
            } else if (char === '\n' || char === '\r') {
                result += char;
            }
            continue;
        }

        if (inString) {
            result += char;
            if (escapeNext) {
                escapeNext = false;
            } else if (char === '\\') {
                escapeNext = true;
            } else if (char === stringQuote) {
                inString = false;
            }
            continue;
        }

        if (char === '"' || char === "'") {
            inString = true;
            stringQuote = char;
            result += char;
            continue;
        }

        if (char === '/' && next === '/') {
            lineComment = true;
            i++;
            continue;
        }

        if (char === '/' && next === '*') {
            blockComment = true;
            i++;
            continue;
        }

        result += char;
    }

    return result;
};

const stripTrailingCommas = (source: string) => source.replace(/,\s*([}\]])/g, '$1');
const parseSettings = (source: string) => JSON.parse(stripTrailingCommas(stripJsonComments(source)));

export { parseSettings };
