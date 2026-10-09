export type AssetRoots = {
  repositoryData: string;
  navigation: string;
  maps: string;
  mapJobs: string;
  groundReports: string;
  continuation: string;
  studioBuild: string;
  previewBuild: string;
  tools: string;
  gaussian?: string;
};
export type AssetConfig = {
  version: 1;
  file: string;
  configured: boolean;
  projectRoot: string;
  profile: "local" | "mac-studio";
  roots: AssetRoots;
  recordedRoots: Partial<AssetRoots & { projectRoot: string }>;
  mounts: { urlPrefix: string; path: string }[];
  python?: string;
};
export const PROJECT_ROOT: string;
export const GiB: number;
export function loadAssetConfig(options?: {
  file?: string;
  projectRoot?: string;
  ignoreEnvironment?: boolean;
}): AssetConfig;
export function contained(root: string, file: string): boolean;
export function physicalPath(file: string): string;
export function overlaps(a: string, b: string): boolean;
export function resolveAssetUrl(url: string, config?: AssetConfig): string;
export function resolveRecordedPath(file: string, config?: AssetConfig): string;
export function machineLimits(
  config?: AssetConfig,
  memoryBytes?: number,
): {
  reserveGiB: number;
  maxAddedGiB: number;
  maxRssGiB: number;
  heapGiB?: number;
  concurrency: number;
};
