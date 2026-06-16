#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const quoteLiteral = (value) => {
  if (value === null || value === undefined) return 'null';
  return `'${String(value).replace(/'/g, "''")}'`;
};

const quoteArray = (values) => {
  if (!Array.isArray(values) || !values.length) return "'{}'";
  return `array[${values.map(quoteLiteral).join(',')}]::text[]`;
};

const boolLiteral = (value) => value ? 'true' : 'false';

const numberLiteral = (value) => {
  return typeof value === 'number' && Number.isFinite(value) ? String(Math.trunc(value)) : 'null';
};

const index = JSON.parse(await readFile(new URL('../data/index.json', import.meta.url), 'utf8'));
const resources = Array.isArray(index.resources) ? index.resources : [];
const uniqueResources = Array.from(new Map(resources.map((resource) => [resource.id, resource])).values());

const rows = uniqueResources.map((resource) => {
  const files = resource.files ?? {};
  const fileSize = resource.fileSize ?? {};
  const viewer = resource.viewer ?? {};
  const version = resource.version ?? {};

  return [
    quoteLiteral(resource.id),
    quoteLiteral(resource.route),
    quoteLiteral(resource.title),
    quoteArray(resource.category),
    quoteLiteral(resource.experienceType),
    quoteLiteral(files.model),
    quoteLiteral(files.settings),
    quoteLiteral(files.thumbnail),
    numberLiteral(fileSize.model),
    numberLiteral(fileSize.total),
    quoteLiteral(viewer.defaultCameraMode),
    boolLiteral(!!(files.voxel || files.voxelManifest || files.collision)),
    boolLiteral(!!files.environment),
    quoteLiteral(version.addedIn),
    quoteLiteral(version.updatedIn)
  ];
});

console.log('-- Generated from data/index.json. Pipe into psql or the Supabase SQL editor.');
console.log('insert into analytics.dim_resource (');
console.log('  resource_id, route, title, category, experience_type, model_file, settings_file, thumbnail_file,');
console.log('  model_size_bytes, total_size_bytes, default_camera_mode, has_voxel, has_environment, added_in, updated_in');
console.log(') values');
console.log(rows.map((row) => `  (${row.join(', ')})`).join(',\n'));
console.log(`on conflict (resource_id) do update set
  route = excluded.route,
  title = excluded.title,
  category = excluded.category,
  experience_type = excluded.experience_type,
  model_file = excluded.model_file,
  settings_file = excluded.settings_file,
  thumbnail_file = excluded.thumbnail_file,
  model_size_bytes = excluded.model_size_bytes,
  total_size_bytes = excluded.total_size_bytes,
  default_camera_mode = excluded.default_camera_mode,
  has_voxel = excluded.has_voxel,
  has_environment = excluded.has_environment,
  added_in = excluded.added_in,
  updated_in = excluded.updated_in,
  indexed_at = now();`);
