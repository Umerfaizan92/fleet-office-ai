// Real-browser regression checks against an isolated local server and throwaway accounts.
// Setup: npx playwright install chromium; npm run test:ui
import { chromium } from 'playwright';
import {createDb} from '../src/db.js';
import { spawn } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';

const root=path.resolve(import.meta.dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'superpro-ui-'));
const serverSocket=net.createServer();await new Promise(r=>serverSocket.listen(0,'127.0.0.1',r));
const port=serverSocket.address().port;await new Promise(r=>serverSocket.close(r));
const base=`http://127.0.0.1:${port}`,adminKey=randomBytes(32).toString('hex');
const secret=()=>randomBytes(32).toString('hex');
const child=spawn(process.execPath,['src/server.js'],{cwd:root,env:{PATH:process.env.PATH,HOME:temp,NODE_ENV:'test',SUPERPRO_SKIP_DOTENV:'1',PORT:String(port),PUBLIC_BASE_URL:base,ALLOWED_ORIGINS:base,DATABASE_PATH:path.join(temp,'test.sqlite'),UPLOAD_DIR:path.join(temp,'uploads'),SAAS_VERIFICATION_TEST_MODE:'1',ADMIN_API_KEY:adminKey,SESSION_SECRET:secret(),SAAS_SESSION_SECRET:secret(),ADMIN_SESSION_SECRET:secret(),INTEGRATION_ENCRYPTION_KEY:secret()},stdio:['ignore','pipe','pipe']});
let serverLog='';child.stdout.on('data',b=>serverLog+=b);child.stderr.on('data',b=>serverLog+=b);
let browser;const errors=[],results=[],failedFounderRequests=[];
const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
const screenshot=async(page,name)=>{if(process.env.UI_SCREENSHOT_DIR){fs.mkdirSync(process.env.UI_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.UI_SCREENSHOT_DIR,name+'.png'),fullPage:true})}};
try{
  let ready=false;for(let i=0;i<100&&!ready;i++){if(child.exitCode!==null)throw Error(serverLog.slice(-2000));try{ready=(await fetch(base+'/healthz')).ok}catch{}if(!ready)await new Promise(r=>setTimeout(r,100))}assert.ok(ready,'local server starts');
  browser=await chromium.launch({headless:true,...(process.env.UI_CHROMIUM_PATH?{executablePath:process.env.UI_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']}:{} )});
  const context=await browser.newContext();const page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
  await check('public landing keeps its palette, motion control and responsive layout',async()=>{
    for(const width of [390,1440]){await page.setViewportSize({width,height:900});await page.goto(base+'/saas/');await page.locator('.sp-motion-toggle').waitFor({state:'visible'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await screenshot(page,'landing-'+width);}
  });
  for(const width of [390,768,1440]){
    await page.setViewportSize({width,height:900});await page.goto(base+'/saas/sign-in.html');
    await check(`sign-in at ${width}px: no horizontal overflow; shared font and tabs`,async()=>{
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      assert.match(await page.locator('body').evaluate(e=>getComputedStyle(e).fontFamily),/Manrope/);
      const business=page.getByRole('tab',{name:'Business sign-in'}),operator=page.getByRole('tab',{name:'Platform operator'});
      await business.focus();await business.press('ArrowRight');assert.equal(await operator.getAttribute('aria-selected'),'true');assert.ok(await page.locator('#operator-form').isVisible());
      await operator.press('Home');assert.ok(await page.locator('#login-form').isVisible());
      await page.locator('#login-form .pw-eye').click();assert.equal(await page.locator('#login-form input[name=password]').getAttribute('type'),'text');
      await page.locator('#login-form .pw-eye').click();assert.equal(await page.locator('#login-form input[name=password]').getAttribute('type'),'password');
    });
    await screenshot(page,'signin-'+width);
  }
  await page.goto(base+'/saas/sign-in.html#operator');await check('operator deep link preserves the selected access mode',async()=>assert.ok(await page.locator('#operator-form').isVisible()));
  const password='UI-only-'+secret()+'!';
  const post=async(url,data)=>{const r=await context.request.post(base+url,{data});assert.ok(r.ok(),`${url}: ${r.status()} ${await r.text()}`);return r.json()};
  const registration=await post('/api/saas/registration/start',{business_name:'Design Test Services',identifier_type:'ABN',business_identifier:'33051775556',state:'WA',postcode:'6000',full_name:'UI Test Owner',email:'ui.owner@example.test',phone:'0411222667',password,confirm_password:password,plan_id:'starter',accept_terms:true,terms_version:'2026-09'});
  await post('/api/saas/registration/verify',{pending_id:registration.pending_id,email_code:registration.delivery.test_codes.email,sms_code:registration.delivery.test_codes.sms});
  await post('/api/saas/login',{email:'ui.owner@example.test',password});
  const me=await (await context.request.get(base+'/api/saas/me')).json();
  const legal=await (await context.request.get(base+'/api/saas/legal')).json();await post('/api/saas/legal/accept',{version:legal.version,agree:true});
  await page.goto(base+'/saas/workspace.html');
  await page.evaluate(slug=>{localStorage.setItem(`gds-tour-${slug}`,'done');localStorage.setItem(`gds-tour-${slug}-setup`,'prompted')},me.organisation.slug);
  const release=await (await context.request.get(base+'/api/saas/releases/latest')).json();if(release.release)await page.evaluate(v=>localStorage.setItem('superpro_release_seen:'+v,'1'),release.release.version);
  await page.reload();await page.locator('#workspace').waitFor({state:'visible'});
  // Dismiss first-run notices in this throwaway workspace; no production records are touched.
  await page.evaluate(()=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());document.querySelector('[data-tour-skip]')?.click()});
  await check('business navigation resolves every owner route to one visible view',async()=>{
    const views=await page.evaluate(()=>window.SuperProNav?.DOMAINS.flatMap(d=>d.items.filter(i=>!i.roles||i.roles.includes('owner')))||[]);
    // Source-driven canonical routes, including the views whose data starts empty.
    const hashes=views.length?views.map(v=>v.path):['today/home','today/approvals','customers/list','customers/stock','customers/inbox','customers/jobs','people/workers','people/staff','people/hiring','marketing/studio','marketing/growth','marketing/search','marketing/connections','money/ledger','money/billing','setup/settings','setup/import','setup/print','setup/trust','setup/help','setup/manual'];
    for(const hash of hashes){await page.evaluate(h=>{location.hash=h},hash);await page.waitForTimeout(80);assert.equal(await page.locator('#workspace .view:visible').count(),1,hash);const expected=views.find(v=>v.path===hash)?.view;if(expected)assert.ok(await page.locator('#'+expected+'-view').isVisible(),hash)}
    console.log('Business routes checked:',hashes.length);
  });
  await check('desktop menus open on hover, close on leave and support keyboard',async()=>{
    for(const domain of ['today','customers','people','marketing','money','setup']){
      const group=page.locator('.nav-domain[data-domain="'+domain+'"]');
      await group.locator('.nav-domain-toggle').hover();
      assert.equal(await group.getAttribute('data-open'),'true');
      const bounds=await group.locator('.nav-domain-items').boundingBox();
      assert.ok(bounds.x>=0&&bounds.x+bounds.width<=1441&&bounds.y+bounds.height<=901,domain);
      await page.mouse.move(1400,700);await page.waitForTimeout(240);
      assert.equal(await group.getAttribute('data-open'),'false');
    }
    const setup=page.locator('.nav-domain[data-domain="setup"]');
    await setup.locator('.nav-domain-toggle').focus();await page.keyboard.press('ArrowDown');
    assert.ok(await setup.locator('.nav-item').first().evaluate(e=>e===document.activeElement));
    await page.keyboard.press('End');assert.ok(await setup.locator('.nav-item').last().evaluate(e=>e===document.activeElement));
    await page.keyboard.press('Escape');assert.equal(await setup.getAttribute('data-open'),'false');
  });
  await check('overflowing menus scroll at the edge and stop on pointer leave',async()=>{
    const group=page.locator('.nav-domain[data-domain="setup"]');await group.locator('.nav-domain-toggle').hover();
    const menu=group.locator('.nav-domain-items');await menu.evaluate(e=>{e.style.maxHeight='150px';e.scrollTop=0});
    const r=await menu.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height-5);await page.waitForTimeout(200);
    assert.ok(await menu.evaluate(e=>e.scrollTop)>0,'edge hover scrolls');
    await page.mouse.move(1400,700);const stopped=await menu.evaluate(e=>e.scrollTop);await page.waitForTimeout(100);assert.equal(await menu.evaluate(e=>e.scrollTop),stopped);
  });
  await check('touch menus open on tap and keep their options inside the viewport',async()=>{
    const touch=await browser.newContext({hasTouch:true,isMobile:true,viewport:{width:390,height:844},storageState:await context.storageState()});
    try{const p=await touch.newPage();await p.goto(base+'/saas/workspace.html');await p.locator('#workspace').waitFor({state:'visible'});
      const toggle=p.locator('.nav-domain[data-domain="setup"] .nav-domain-toggle');await toggle.tap();
      const menu=p.locator('.nav-domain[data-domain="setup"] .nav-domain-items');await menu.waitFor({state:'visible'});const b=await menu.boundingBox();assert.ok(b.x>=0&&b.x+b.width<=391&&b.y+b.height<=845,JSON.stringify(b));
      await menu.locator('[data-view="manual"]').tap();assert.ok(await p.locator('#manual-view').isVisible());
    }finally{await touch.close()}
  });
  await check('live motion is bounded, uses existing colours and can be paused',async()=>{
    assert.equal(await page.locator('html').evaluate(e=>getComputedStyle(e).getPropertyValue('--sp-accent').trim()),'#e2bd72');
    assert.ok(await page.locator('.sp-motion-visible').count()<=12);
    const toggle=page.locator('.sp-motion-toggle');await toggle.click();assert.equal(await toggle.getAttribute('aria-pressed'),'false');assert.equal(await page.locator('html').evaluate(e=>e.classList.contains('sp-motion-enabled')),false);
    await toggle.click();assert.equal(await toggle.getAttribute('aria-pressed'),'true');
  });
  let integrationReads=0;page.on('request',r=>{if(new URL(r.url()).pathname==='/api/saas/integrations/self-service')integrationReads++});
  await page.evaluate(()=>location.hash='marketing/connections');
  await check('connectors page two stays selected while readiness details update',async()=>{
    const grid=page.locator('#self-service-integration-grid');
    await grid.locator('[data-provider-card]').first().waitFor();
    const pager=page.locator('#self-service-integration-grid + .focus-pagination');
    assert.ok(await grid.locator('[data-provider-card="snapchat"]').isVisible(),'Snapchat appears at the end of page one');
    await pager.getByRole('button',{name:'Next →',exact:true}).click();
    await page.waitForTimeout(800);
    assert.match(await pager.innerText(),/Page 2 of/);
    assert.ok(await grid.locator('[data-provider-card="x"]').isVisible(),'First connector after Snapchat remains reachable');
    const later=grid.locator('[data-provider-card="x"]');
    await later.locator('[data-connect-provider]').click();
    await page.waitForTimeout(400);
    assert.match(await pager.innerText(),/Page 2 of/);
    assert.ok(await later.locator('[data-im-requirements]').isVisible());
    assert.ok(await grid.locator('[data-provider-card="website"]').isVisible(),'Website after Snapchat is reachable');
    assert.ok(await grid.locator('[data-provider-card="email_sms"]').isVisible(),'Email/SMS after Snapchat is reachable');
    await screenshot(page,'connectors-second-page');
    const before=integrationReads;await page.waitForTimeout(700);assert.equal(integrationReads,before,'an idle connector list must not refetch itself');
    await pager.getByRole('button',{name:'← Previous',exact:true}).click();
    assert.match(await pager.innerText(),/Page 1 of/);
  });
  await page.evaluate(()=>location.hash='customers/list');await page.waitForTimeout(100);
  await check('customer dialog fits mobile and Cancel works with required fields empty',async()=>{
    await page.setViewportSize({width:390,height:700});
    // Open using the actual customer control, then test native validation/cancel behavior.
    await page.locator('#cust-new').click();const dialog=page.locator('#cust-dialog');assert.ok(await dialog.isVisible());
    const b=await dialog.boundingBox();assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=391&&b.y+b.height<=701,JSON.stringify(b));
    await dialog.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await dialog.isVisible(),false);
  });
  await check('owner can find role authorisation and save employee permissions',async()=>{
    await page.evaluate(()=>location.hash='people/staff');await page.locator('#team-view').waitFor({state:'visible'});
    await page.locator('#team-open-invite').waitFor({state:'visible'});
    const worker=await post('/api/saas/workers',{full_name:'UI Test Employee',email:'ui.employee@example.test',role_title:'Office employee',employment_type:'casual',work_status:'australian_citizen'});
    const invitation=await post('/api/saas/team-accounts/invitations',{worker_id:worker.id,email:'ui.employee@example.test',role:'employee'});
    const db=createDb(path.join(temp,'test.sqlite'));
    try{const now=new Date().toISOString();db.prepare('INSERT INTO team_invite_verifications(invite_id,code_hash,expires_at,sent_at) VALUES (?,?,?,?)').run(invitation.id,createHash('sha256').update(invitation.id+':654321').digest('hex'),new Date(Date.now()+600000).toISOString(),now)}finally{db.close()}
    await post('/api/saas/team-accounts/accept',{token:invitation.invite_path.split('#')[1],email:'ui.employee@example.test',password,email_code:'654321',consent:true});
    await page.reload();await page.locator('[data-team-role]').waitFor({state:'visible'});
    const form=page.locator('[data-team-role]').first();await form.locator('select').selectOption('manager');await form.getByRole('button',{name:'Save role'}).click();await page.waitForFunction(()=>document.querySelector('#team-status')?.textContent.includes('Role authorised'));
    await page.locator('[data-team-role] select').selectOption('employee');await page.locator('[data-team-role] button').click();await page.waitForFunction(()=>document.querySelector('[data-team-role] select')?.value==='employee');
  });
  await check('employee sends an AI question and receives a text answer',async()=>{
    const employee=await browser.newContext();try{
      const r=await employee.request.post(base+'/api/saas/login',{data:{email:'ui.employee@example.test',password}});assert.ok(r.ok());const employeeLegal=await (await employee.request.get(base+'/api/saas/legal')).json();assert.ok((await employee.request.post(base+'/api/saas/legal/accept',{data:{version:employeeLegal.version,agree:true}})).ok());
      const p=await employee.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/saas/workspace.html');await p.locator('#workspace').waitFor({state:'visible'});
      await p.evaluate(slug=>{localStorage.setItem(`gds-tour-${slug}`,'done');document.querySelectorAll('dialog[open]').forEach(d=>d.close())},me.organisation.slug);
      await p.locator('#sp-ask-input').fill('How do I see my assigned work?');await p.locator('.sp-ask-send').click();
      await p.locator('[data-copilot-speaker]').click();
      await p.waitForFunction(()=>document.querySelectorAll('.copilot-message.ai:not(.waiting)').length>1);assert.ok((await p.locator('.copilot-message.ai').last().innerText()).length>30);
      assert.equal(await p.locator('.nav-item[data-view="team"]').count(),0);
    }finally{await employee.close()}
  });
  await check('notification preferences and delivery activity are visible on mobile',async()=>{
    await page.locator('[aria-label="Notifications"]').click();const dialog=page.locator('#superpro-platform-notices');await dialog.waitFor({state:'visible'});
    await dialog.locator('input[name=muted]').check();await dialog.getByRole('button',{name:'Save preferences',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-preferences-status]')?.textContent==='Preferences saved.');
    assert.equal((await (await context.request.get(base+'/api/saas/notification-preferences')).json()).preferences.muted,true);
    await dialog.locator('input[name=muted]').uncheck();await dialog.getByRole('button',{name:'Save preferences',exact:true}).click();
    await dialog.locator('[data-delivery-tab]').click();await dialog.getByRole('heading',{name:'Delivery & follow-ups'}).waitFor();
    await dialog.locator('[data-notice-close]').click();
  });
  await check('staff sender identity, sent/seen receipts and compact availability work across sessions',async()=>{
    const employee=await browser.newContext();try{
      assert.ok((await employee.request.post(base+'/api/saas/login',{data:{email:'ui.employee@example.test',password}})).ok());
      const p=await employee.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/saas/workspace.html');await p.locator('#workspace').waitFor({state:'visible'});await p.waitForFunction(()=>!!window.SuperProStaffChat);
      await p.evaluate(()=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());localStorage.setItem('superpro_copilot_voice','off')});
      await page.evaluate(()=>window.SuperProStaffChat.open());const chat=page.locator('#gds-staff-chat');await chat.locator('.sc-compose textarea').fill('Delivery receipt browser test');await chat.locator('.sc-send').click();await chat.locator('.sc-msg.mine').last().getByText('UI Test Owner',{exact:true}).waitFor();
      await p.evaluate(()=>window.SuperProStaffChat.open());await p.locator('.sc-bubble p').filter({hasText:'Delivery receipt browser test'}).waitFor();
      await chat.locator('.sc-msg.mine').last().locator('.sc-ticks').filter({hasText:'Seen'}).waitFor({timeout:12000});
      await chat.locator('.sc-team>summary').click();await chat.locator('.staff-status-editor>summary').click();await chat.locator('.staff-availability-form select').selectOption('busy');await chat.locator('input[name=reason]').fill('Reviewing enquiries');await chat.getByRole('button',{name:'Update my status'}).click();
      await chat.locator('.staff-directory-person').filter({hasText:'UI Test Owner'}).filter({hasText:'busy'}).waitFor();
      assert.ok(await chat.locator('.staff-directory-list').evaluate(e=>e.clientHeight<=120));await screenshot(page,'staff-chat-availability');await page.evaluate(()=>window.SuperProStaffChat.close());
    }finally{await employee.close()}
  });
  await check('closing AI before playback context resumes prevents late audio',async()=>{
    await page.locator('.copilot-launch').click();
    await page.evaluate(()=>{window.__spoken=0;window.__stopped=0;window.SuperProAIClient={ensurePlaybackContext:()=>new Promise(r=>window.__resume=r),speak:()=>{window.__spoken++;return Promise.resolve()},stopSpeech:()=>window.__stopped++,stopListening:()=>{}};window.GDSProductGuide.answerAsync=async()=>({text:'A delayed test reply',language:'en'})});
    await page.locator('.copilot-panel textarea').fill('Test delayed reply');await page.locator('.copilot-send').click();await page.waitForFunction(()=>typeof window.__resume==='function');
    await page.locator('[data-copilot-close]').click();await page.evaluate(()=>window.__resume());await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.__spoken),0);assert.ok(await page.evaluate(()=>window.__stopped)>0);
    await page.reload();await page.locator('#workspace').waitFor({state:'visible'});
  });
  await check('light and dark chat controls keep readable text and contained layout',async()=>{
    for(const theme of ['light','dark']){
      await page.evaluate(t=>{localStorage.setItem('foai-theme',t);document.documentElement.dataset.theme=t},theme);await page.locator('.copilot-launch').click();await page.waitForTimeout(100);assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
      const styles=await page.locator('.copilot-panel textarea').evaluate(e=>{const s=getComputedStyle(e);return {color:s.color,bg:s.backgroundColor}});assert.notEqual(styles.color,styles.bg);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await screenshot(page,'chat-'+theme);await page.locator('[data-copilot-close]').click();
    }
  });
  await screenshot(page,'business-mobile');
  await page.emulateMedia({reducedMotion:'reduce'});await check('reduced motion disables decorative animation',async()=>assert.equal(await page.locator('.sp-logo').first().evaluate(e=>getComputedStyle(e).animationName),'none'));
  page.on('response',r=>{if(r.url().startsWith(base+'/api/admin/')&&r.status()>=400)failedFounderRequests.push(r.status()+' '+new URL(r.url()).pathname)});
  await page.goto(base+'/saas/sign-in.html#operator');await page.locator('#operator-form input[name=key]').fill(adminKey);await page.locator('#operator-form button[type=submit]').click();await page.waitForURL(base+'/office/');await page.locator('#app').waitFor({state:'visible'});
  await check('founder mobile menu opens, filters, navigates and restores focus on Escape',async()=>{
    const menu=page.locator('.sp-office-menu');await menu.click();assert.equal(await menu.getAttribute('aria-expanded'),'true');await page.locator('.sp-nav-filter').fill('customer');await page.locator('aside .nav[data-view=customers]').waitFor({state:'visible'});assert.equal(await page.locator('aside .nav:visible').count(),1);await page.keyboard.press('Escape');assert.equal(await menu.getAttribute('aria-expanded'),'false');assert.ok(await menu.evaluate(e=>document.activeElement===e));
    await menu.click();await page.locator('.sp-nav-filter').fill('');await page.locator('aside .nav[data-view=customers]').click();assert.ok(await page.locator('#customers-view').isVisible());assert.equal(await menu.getAttribute('aria-expanded'),'false');
  });
  await screenshot(page,'founder-mobile');await page.setViewportSize({width:1440,height:1000});
  await check('founder navigation opens all 23 sections with one visible view',async()=>{const views=await page.locator('aside .nav').evaluateAll(nodes=>nodes.map(n=>n.dataset.view));for(const view of views){await page.locator(`aside .nav[data-view="${view}"]`).click();await page.locator(`#${view}-view`).waitFor({state:"visible"});assert.equal(await page.locator('#app .view:visible').count(),1,view);assert.ok(await page.locator(`#${view}-view`).isVisible(),view)}console.log('Founder sections checked:',views.length)});
  await page.locator('aside .nav[data-view=dashboard]').click();await page.locator('aside .sp-logo').waitFor({state:'visible'});await screenshot(page,'founder-desktop');
  await page.waitForTimeout(500);await check('founder API requests succeed across all sections',async()=>assert.deepEqual(failedFounderRequests,[]));
  await check('no browser JavaScript exceptions',async()=>assert.deepEqual(errors,[]));
  console.log(`UI CHECKS PASSED: ${results.length}`);
}finally{await browser?.close();child.kill('SIGTERM');await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));fs.rmSync(temp,{recursive:true,force:true});}
