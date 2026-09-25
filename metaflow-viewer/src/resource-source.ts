import type { PrimarySourceKind, ResourceComposition } from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

const primarySourceFilename = (contentUrl?: string, baseUrl = 'https://viewer.invalid/') => {
    if (!contentUrl) return '';

    try {
        const pathname = new URL(contentUrl, baseUrl).pathname;
        return pathname.slice(pathname.lastIndexOf('/') + 1).toLowerCase();
    } catch {
        return '';
    }
};

const classifyPrimarySource = (contentUrl?: string, baseUrl?: string): PrimarySourceKind => {
    const filename = primarySourceFilename(contentUrl, baseUrl);

    if (filename === 'lod-meta.json') return 'streaming-lod';
    if (filename.endsWith('.sog')) return 'sog-bundle';
    if (filename.endsWith('.json')) return 'sog-meta';
    if (filename.endsWith('.ply')) return 'ply';
    return 'unsupported';
};

const getResourceComposition = (environmentUrl?: string): ResourceComposition =>
    environmentUrl ? 'subject-with-environment' : 'subject-only';

const validateBound = (value: unknown, path: string) => {
    if (!isRecord(value)) {
        throw new Error(`${path} must be an object`);
    }

    const min = value.min;
    const max = value.max;
    if (!Array.isArray(min) || min.length !== 3 || !min.every(Number.isFinite)) {
        throw new Error(`${path}.min must contain three finite numbers`);
    }
    if (!Array.isArray(max) || max.length !== 3 || !max.every(Number.isFinite)) {
        throw new Error(`${path}.max must contain three finite numbers`);
    }
    for (let axis = 0; axis < 3; axis++) {
        if (min[axis] > max[axis]) {
            throw new Error(`${path}.min[${axis}] must not exceed max[${axis}]`);
        }
    }
};

const requireNonNegativeInteger = (value: unknown, path: string) => {
    if (!Number.isInteger(value) || (value as number) < 0) {
        throw new Error(`${path} must be a non-negative integer`);
    }
};

const validateStreamingLodManifest = (value: unknown) => {
    if (!isRecord(value)) {
        throw new Error('manifest must be an object');
    }

    const lodLevels = value.lodLevels;
    if (!Number.isInteger(lodLevels) || (lodLevels as number) <= 0) {
        throw new Error('lodLevels must be a positive integer');
    }

    const filenames = value.filenames;
    if (
        !Array.isArray(filenames) ||
        filenames.length === 0 ||
        !filenames.every((filename) => typeof filename === 'string' && filename.length > 0)
    ) {
        throw new Error('filenames must be a non-empty array of non-empty strings');
    }

    if (!isRecord(value.tree)) {
        throw new Error('tree must be an object');
    }

    const pending: { node: Record<string, unknown>; path: string }[] = [{ node: value.tree, path: 'tree' }];
    let leafCount = 0;

    while (pending.length > 0) {
        const { node, path } = pending.pop()!;
        validateBound(node.bound, `${path}.bound`);

        const hasLods = node.lods !== undefined;
        const hasChildren = node.children !== undefined;
        if (hasLods && hasChildren) {
            throw new Error(`${path} cannot contain both lods and children`);
        }

        if (hasLods) {
            if (!isRecord(node.lods) || Object.keys(node.lods).length === 0) {
                throw new Error(`${path}.lods must be a non-empty object`);
            }

            for (const [levelText, lodValue] of Object.entries(node.lods)) {
                if (!/^\d+$/.test(levelText)) {
                    throw new Error(`${path}.lods contains invalid level ${levelText}`);
                }
                const level = Number(levelText);
                if (level >= (lodLevels as number)) {
                    throw new Error(`${path}.lods.${levelText} exceeds lodLevels`);
                }
                if (!isRecord(lodValue)) {
                    throw new Error(`${path}.lods.${levelText} must be an object`);
                }

                requireNonNegativeInteger(lodValue.file, `${path}.lods.${levelText}.file`);
                if ((lodValue.file as number) >= filenames.length) {
                    throw new Error(`${path}.lods.${levelText}.file is outside filenames`);
                }
                requireNonNegativeInteger(lodValue.offset, `${path}.lods.${levelText}.offset`);
                requireNonNegativeInteger(lodValue.count, `${path}.lods.${levelText}.count`);
            }

            leafCount++;
            continue;
        }

        if (!hasChildren || !Array.isArray(node.children) || node.children.length === 0) {
            throw new Error(`${path} must contain non-empty children or lods`);
        }
        for (let index = node.children.length - 1; index >= 0; index--) {
            const child = node.children[index];
            if (!isRecord(child)) {
                throw new Error(`${path}.children[${index}] must be an object`);
            }
            pending.push({ node: child, path: `${path}.children[${index}]` });
        }
    }

    if (leafCount === 0) {
        throw new Error('tree must contain at least one leaf');
    }
};

export { classifyPrimarySource, getResourceComposition, validateStreamingLodManifest };
