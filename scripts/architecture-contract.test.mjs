import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=relative=>readFileSync(path.join(root,relative),'utf8');
const duplicates=items=>{
 const seen=new Set(),found=new Set();
 for(const item of items){if(seen.has(item))found.add(item);else seen.add(item);}
 return [...found];
};

test('canonical SaaS and compatibility entrypoints remain present',()=>{
 for(const relative of ['src/server.js','src/db.js','saas/workspace.html','saas/index.html','office/index.html','src/team-accounts.js']){
  assert.ok(existsSync(path.join(root,relative)),`Missing compatibility or canonical surface: ${relative}`);
 }
});

test('no duplicate literal HTTP method and route registrations',()=>{
 const source=read('src/server.js');
 const routes=[...source.matchAll(/\bapp\.(get|post|put|patch|delete|all)\s*\(\s*['"`]([^'"`]+)['"`]/g)]
  .map(match=>`${match[1].toUpperCase()} ${match[2]}`);
 assert.ok(routes.length>100,'Route scan unexpectedly empty or incomplete');
 assert.deepEqual(duplicates(routes),[],'Duplicate literal HTTP route registration');
});

test('HTML entrypoints do not duplicate IDs or asset references',()=>{
 for(const relative of ['saas/workspace.html','saas/index.html','office/index.html']){
  const html=read(relative);
  const ids=[...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map(m=>m[1]);
  assert.deepEqual(duplicates(ids),[],`Duplicate HTML ID in ${relative}`);
  const assets=[...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)]
   .map(m=>m[1].split('?')[0]).filter(v=>/\.(?:js|css)$/i.test(v));
  assert.deepEqual(duplicates(assets),[],`Duplicate JS/CSS asset in ${relative}`);
 }
});

test('initial SQL schema does not redeclare table names',()=>{
 const source=read('src/db.js');
 const tables=[...source.matchAll(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([A-Za-z_]\w*)/gi)].map(m=>m[1].toLowerCase());
 assert.ok(tables.length>40,'Schema scan unexpectedly empty or incomplete');
 assert.deepEqual(duplicates(tables),[],'Duplicate CREATE TABLE declarations');
});
