import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('saas/workspace.html','utf8');
const app=fs.readFileSync('saas/app.js','utf8');
const css=fs.readFileSync('saas/app.css','utf8');

test('settings link is present in source and runtime-rebuilt navigation',()=>{
  assert.match(html,/<button[^>]+data-view="settings"[^>]*>[\s\S]*?Workspace Settings[\s\S]*?<\/button>/);
  assert.match(app,/data-view="settings"[^>]*>[\s\S]*?Workspace Settings/);
  assert.match(app,/viewSequence\s*=\s*\[[^\]]*'settings'/);
  assert.match(app,/settings:\['PROFILE','Workspace Settings'\]/);
});

test('exact settings view ID is understood by existing view router',()=>{
  assert.match(html,/<section[^>]*class="view workspace-view"[^>]*id="view-settings"[^>]*hidden/);
  assert.match(app,/name==='settings'\?'view-settings'/);
  assert.match(app,/name==='settings'\)loadWorkspaceBranding/);
});

test('single canonical branding controls and compatible backend payload',()=>{
  for(const id of [
    'workspace-branding-form','branding-display-name','branding-theme','branding-primary-color',
    'branding-secondary-color','branding-voice','branding-logo-file','branding-logo-preview',
    'branding-logo-url','save-workspace-branding','upload-workspace-logo'
  ]){
    const found=html.match(new RegExp('id="'+id+'"','g'))||[];
    assert.equal(found.length,1,'Expected exactly one '+id);
  }
  assert.match(html,/id="branding-primary-color"[^>]*type="color"/);
  assert.match(html,/id="branding-secondary-color"[^>]*type="color"/);
  assert.match(html,/id="branding-logo-file"[^>]*type="file"/);
  assert.match(html,/id="save-workspace-branding"[^>]*type="submit"/);
  assert.match(app,/\$\('#workspace-branding-form'\)\?\.addEventListener\('submit'/);
  for(const field of ['display_name','logo_url','theme','primary_color','secondary_color','brand_voice'])
    assert.match(app,new RegExp(field+':\\$\\('));
  assert.match(app,/method:'PUT',body:JSON.stringify\(payload\)/);
  assert.match(app,/api\('\/api\/saas\/branding'/);
  assert.match(app,/body\.append\('logo',file\)/);
  assert.match(app,/fetch\('\/api\/saas\/branding\/logo'/);
});

test('onboarding settings still has a valid Appearance panel linking to new view',()=>{
  assert.match(html,/data-settings-target="workspace-branding-settings"/);
  assert.match(html,/id="workspace-branding-settings"/);
  assert.match(html,/id="workspace-branding-settings"[\s\S]*?data-jump="settings"/);
  const appearanceCard=html.match(/<article[^>]*id="workspace-branding-settings"[^>]*>[\s\S]*?<\/article>/)?.[0]||'';
  assert.ok(appearanceCard,'Appearance shortcut must exist');
  assert.doesNotMatch(appearanceCard,/id="branding-display-name"/);
});

test('role-gated editing and accessible upload/status controls',()=>{
  assert.match(app,/\['owner','admin','super_admin'\]/);
  assert.match(app,/querySelectorAll\('input,select,button'\)\.forEach/);
  assert.match(html,/id="branding-upload-feedback" role="status" aria-live="polite"/);
  assert.match(html,/id="branding-feedback" role="status" aria-live="polite"/);
  assert.match(app,/URL\.createObjectURL\(file\)/);
  assert.match(app,/URL\.revokeObjectURL\(brandingPreviewUrl\)/);
  assert.match(css,/@media\(max-width:680px\)/);
});
