import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {REPO_ROOT,validateVersionHistories} from '../mcl.mjs';
test('revision 6 accepts PR completion and keeps legacy archive pairs mandatory when declared',async()=>{
  const base=path.join(REPO_ROOT,'.codex-work/tmp');await mkdir(base,{recursive:true});
  const root=await mkdtemp(path.join(base,'version-trace-'));await mkdir(path.join(root,'metadata'));
  const trace={changeId:'MF-106',pullRequest:'https://github.com/Shuang-su/Metaflow/pull/106'};
  const write=async()=>{const json=JSON.stringify({schemaVersion:'1.1',current:{},entries:[{date:'2026-10-05',trace}]});for(const name of ['version-history.json','editor-version-history.json'])await writeFile(path.join(root,'metadata',name),json);};
  try{
    await write();await validateVersionHistories(root);
    trace.completionManifest='https://example.test/manifest.json';await write();await assert.rejects(()=>validateVersionHistories(root),/completionDossier is required/);
    trace.completionDossier='https://example.test/dossier.md';await write();await validateVersionHistories(root);
    trace.pullRequest='';await write();await assert.rejects(()=>validateVersionHistories(root),/pullRequest is required/);
  }finally{await rm(root,{recursive:true,force:true});}
});
