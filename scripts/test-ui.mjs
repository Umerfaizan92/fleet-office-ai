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
  await check('public landing keeps its palette and compact responsive layout',async()=>{
    for(const width of [390,1440]){await page.setViewportSize({width,height:900});await page.goto(base+'/saas/index.html');await page.locator('.guide-card').waitFor({state:'visible'});assert.equal(await page.locator('.sp-motion-toggle').count(),0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await screenshot(page,'landing-'+width);}
  });
  await check('landing chat and newsletter avoid viewport-sized blank gaps, including desktop mode on a tall phone',async()=>{
    for(const width of [390,980,1440]){
      await page.setViewportSize({width,height:1800});await page.goto(base+'/saas/index.html');await page.locator('.guide-card').waitFor();
      const hero=await page.locator('.hero').boundingBox(),copy=await page.locator('.hero-copy').boundingBox(),guide=await page.locator('.guide-shell').boundingBox();
      if(width<=1100)assert.ok(guide.y-copy.y-copy.height<=34,JSON.stringify({width,copy,guide}));
      assert.ok(hero.height<1100,JSON.stringify({width,hero}));assert.ok((await page.locator('.guide-card').boundingBox()).height<=445);
      const newsletter=await page.locator('.superpro-newsletter').boundingBox();if(newsletter)assert.ok(newsletter.height<500,JSON.stringify(newsletter));
      const composer=await page.locator('.guide-card .chat-composer').boundingBox(),card=await page.locator('.guide-card').boundingBox();assert.ok(composer.y+composer.height<=card.y+card.height,JSON.stringify({composer,card}));
      await screenshot(page,'compact-landing-'+width);
    }
  });
  for(const width of [390,768,1440]){
    await page.setViewportSize({width,height:900});await page.goto(base+'/saas/sign-in.html');
    await check(`sign-in at ${width}px: no horizontal overflow; shared font and separate business form`,async()=>{
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      const fit=await page.evaluate(()=>({height:innerHeight,scroll:document.documentElement.scrollHeight,main:document.querySelector('main').getBoundingClientRect().height}));assert.ok(fit.scroll<=fit.height+1,JSON.stringify({width,...fit}));
      assert.match(await page.locator('body').evaluate(e=>getComputedStyle(e).fontFamily),/Manrope/);
      assert.equal(await page.locator('#operator-form').count(),0);assert.ok(await page.locator('#login-form').isVisible());assert.equal(await page.getByRole('link',{name:'Operator sign-in',exact:true}).getAttribute('href'),'operator-sign-in.html');
      await page.locator('#login-form .pw-eye').click();assert.equal(await page.locator('#login-form input[name=password]').getAttribute('type'),'text');
      await page.locator('#login-form .pw-eye').click();assert.equal(await page.locator('#login-form input[name=password]').getAttribute('type'),'password');
    });
    await screenshot(page,'signin-'+width);
  }
  await check('sign-in desktop mode removes tall blank columns and keeps MFA reachable',async()=>{
    for(const height of [1760,2100]){
      await page.setViewportSize({width:980,height});await page.goto(base+'/saas/sign-in.html');
      const form=await page.locator('.auth-form-side').boundingBox(),features=await page.locator('.signin-feature-panel').boundingBox(),footer=await page.locator('.sp-global-trust-footer').boundingBox();assert.ok(form.width>=980*.7);assert.ok(features.y>=form.y+form.height);assert.ok(footer.y-features.y-features.height<48,JSON.stringify({features,footer}));assert.ok(Math.abs(footer.y+footer.height-height)<=2,JSON.stringify(footer));assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1));assert.ok(Number.parseFloat(await page.locator('input[name=email]').evaluate(e=>getComputedStyle(e).fontSize))>=24);assert.equal(await page.locator('.signin-feature').count(),6);
      await page.locator('#mfa-details summary').click();assert.ok(await page.locator('input[name=mfa_code]').isVisible());await page.locator('#mfa-details summary').click();await screenshot(page,'signin-tall-desktop-mode-'+height);
    }
  });
  await page.goto(base+'/saas/sign-in.html#operator');await page.waitForURL(base+'/saas/operator-sign-in.html');await check('legacy operator deep link opens separate founder sign-in',async()=>assert.ok(await page.locator('#operator-form').isVisible()));
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
  await check('terms dialog fits its content on mobile and tall desktop-mode screens',async()=>{
    const db=createDb(path.join(temp,'test.sqlite'));try{db.prepare('DELETE FROM legal_acceptances').run()}finally{db.close()}
    for(const width of [390,980]){
      await page.setViewportSize({width,height:1500});await page.reload();const dialog=page.locator('dialog.legal-modal');await dialog.waitFor({state:'visible'});
      const b=await dialog.boundingBox();assert.ok(b.height<600,JSON.stringify(b));assert.ok(b.y>=0&&b.y+b.height<=1501);
      assert.equal(await dialog.getByRole('button',{name:'I agree and continue'}).isEnabled(),false);
      await screenshot(page,'compact-terms-'+width);await dialog.locator('#legal-agree').check();await dialog.getByRole('button',{name:'I agree and continue'}).click();await dialog.waitFor({state:'hidden'});
      if(width===390){const d=createDb(path.join(temp,'test.sqlite'));try{d.prepare('DELETE FROM legal_acceptances').run()}finally{d.close()}}
    }
    await page.setViewportSize({width:1440,height:900});assert.ok(await page.locator('#logout').isVisible());
  });
  // Dismiss first-run notices in this throwaway workspace; no production records are touched.
  await page.evaluate(()=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());document.querySelector('[data-tour-skip]')?.click()});
  await check('business navigation resolves every owner route to one visible view',async()=>{
    const views=await page.evaluate(()=>window.SuperProNav?.DOMAINS.flatMap(d=>d.items.filter(i=>!i.roles||i.roles.includes('owner')))||[]);
    // Source-driven canonical routes, including the views whose data starts empty.
    const hashes=views.length?views.map(v=>v.path):['today/home','today/approvals','customers/list','customers/stock','customers/inbox','customers/jobs','people/workers','people/staff','people/hiring','marketing/studio','marketing/growth','marketing/search','marketing/connections','money/ledger','money/billing','setup/settings','setup/import','setup/print','setup/trust','setup/help','setup/manual'];
    for(const hash of hashes){await page.evaluate(h=>{location.hash=h},hash);await page.waitForTimeout(80);assert.equal(await page.locator('#workspace .view:visible').count(),1,hash);const expected=views.find(v=>v.path===hash)?.view;if(expected)assert.ok(await page.locator('#'+expected+'-view').isVisible(),hash)}
    console.log('Business routes checked:',hashes.length);
  });
  await check('Jobs uses visible shared depth, heading icons and actual hover feedback',async()=>{
    await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>location.hash='customers/jobs');await page.locator('#jobs-view').waitFor({state:'visible'});
    const card=page.locator('#jobs-view .sp-surface-card:visible').first();await card.waitFor({state:'visible'});assert.ok(await card.locator('.sp-section-icon').count()>0);await card.hover();await page.waitForTimeout(220);assert.notEqual(await card.evaluate(e=>getComputedStyle(e).translate),'none');await screenshot(page,'jobs-shared-layering');await page.mouse.move(0,0);
  });
  await check('live card heading updates retain one shared icon without mutation loops',async()=>{
    await page.evaluate(()=>{const card=document.createElement('section');card.id='sp-test-live-card';card.className='panel';card.innerHTML='<h2>Live jobs</h2>';document.querySelector('#jobs-view').append(card)});
    const card=page.locator('#sp-test-live-card');await card.locator('.sp-section-icon').waitFor();
    await card.locator('h2').evaluate(e=>e.textContent='Updated jobs');await card.locator('.sp-section-icon').waitFor();
    await page.evaluate(()=>{window.spTestMutations=0;window.spTestObserver=new MutationObserver(r=>window.spTestMutations+=r.length);window.spTestObserver.observe(document.querySelector('#sp-test-live-card'),{childList:true,subtree:true})});
    await page.waitForTimeout(200);assert.equal(await card.locator('.sp-section-icon').count(),1);assert.equal(await page.evaluate(()=>window.spTestMutations),0);
    await page.evaluate(()=>{window.spTestObserver.disconnect();document.querySelector('#sp-test-live-card').remove();delete window.spTestObserver;delete window.spTestMutations});
  });
  await check('short dashboard pages do not push the footer down with blank viewport space',async()=>{
    await page.evaluate(()=>location.hash='today/home');
    for(const width of [390,980,1440]){
      await page.setViewportSize({width,height:1500});await page.waitForTimeout(100);
      const footer=await page.locator('.app-footer').boundingBox(),trust=await page.locator('.sp-global-trust-footer').boundingBox();
      if(footer&&trust)assert.ok(trust.y-footer.y-footer.height<40,JSON.stringify({width,footer,trust}));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await screenshot(page,'compact-dashboard-'+width);
    }
    await page.setViewportSize({width:1440,height:900});
  });
  await check('nine groups contain nested submenu pages and selected state',async()=>{
    const rail=page.locator('#business-navigation'); assert.equal(await rail.locator('[data-domain]').count(),9); assert.equal(await rail.locator('.navigation-page').count(),60);
    await rail.locator('[data-domain=b03]').click(); await rail.locator('[data-nav-page=team]').click(); await page.locator('#team-view').waitFor({state:'visible'});
    assert.equal(await rail.locator('[data-nav-page=team]').getAttribute('aria-current'),'page'); assert.equal(await page.locator('.portal-subtabs [data-jump]').count(),0);
  });
  await check('nested navigation supports keyboard and a mobile drawer',async()=>{
    await page.getByRole('button',{name:'Collapse navigation',exact:true}).click(); assert.equal(await page.locator('#business-navigation').getAttribute('data-compact'),'true');
    await page.getByRole('button',{name:'Expand navigation',exact:true}).focus(); await page.keyboard.press('Enter'); assert.equal(await page.locator('#business-navigation').getAttribute('data-compact'),'false');
    const touch=await browser.newContext({hasTouch:true,isMobile:true,viewport:{width:390,height:844},storageState:await context.storageState()});try{const p=await touch.newPage();await p.goto(base+'/saas/workspace.html');await p.locator('#workspace').waitFor({state:'visible'});await p.getByRole('button',{name:'☰ Menu',exact:true}).tap();await p.locator('#business-navigation [data-domain=b08]').tap();await p.locator('[data-nav-page=manual]').tap();await p.locator('#manual-view').waitFor({state:'visible'});assert.equal(await p.locator('#business-navigation').getAttribute('data-drawer'),'false');assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}finally{await touch.close()}
  });
  await check('live update notice stays clear of the folded rail on phones and tablets',async()=>{
    const p=await context.newPage();try{await p.goto(base+'/saas/workspace.html');await p.locator('#workspace').waitFor({state:'visible'});await p.locator('#gds-live-toasts').waitFor({state:'attached'});
      await p.evaluate(()=>{document.querySelector('#gds-live-toasts').innerHTML='<div class="gds-live-toast success show"><span>✓</span><div><b>Live update</b><small>Notice geometry check</small></div></div>'});
      for(const width of [390,700,768,1440]){await p.setViewportSize({width,height:844});await p.mouse.move(width-4,600);await p.waitForFunction(()=>!document.body.classList.contains('navigation-drawer-open'));
        const g=await p.evaluate(()=>{const n=document.querySelector('#gds-live-toasts .gds-live-toast').getBoundingClientRect(),r=document.querySelector('.portal-rail').getBoundingClientRect();return{left:n.left,right:n.right,railRight:r.right,vw:innerWidth}});
        assert.ok(g.left>=g.railRight,'notice under rail at '+width+': '+JSON.stringify(g));assert.ok(g.right<=g.vw,'notice off screen at '+width+': '+JSON.stringify(g))}
    }finally{await p.close()}
  });
  await check('email centre separates folders and keeps drafts behind review',async()=>{
    await page.evaluate(()=>location.hash='b04/email');await page.locator('#mail-view').waitFor({state:'visible'});await page.mouse.move(1400,700);await page.locator('.portal-rail button:focus').evaluateAll(es=>es.forEach(e=>e.blur()));await page.waitForTimeout(220);await screenshot(page,'email-centre');await page.locator('#mail-view').getByRole('button',{name:'Compose',exact:true}).click();const dialog=page.locator('dialog.portal-modal');await dialog.locator('[name=recipient]').fill('ui-recipient@example.test');await dialog.locator('[name=subject]').fill('Review test');await dialog.locator('[name=body]').fill('An unsent draft for review.');await dialog.getByRole('button',{name:'Save draft for review'}).click();await dialog.waitFor({state:'hidden'});await page.locator('.portal-mail-row').filter({hasText:'Review test'}).click();await page.locator('dialog.portal-modal').getByRole('button',{name:'Approve reviewed version'}).waitFor();assert.equal(await page.locator('dialog.portal-modal').getByRole('button',{name:'Send approved email'}).count(),0);await page.locator('dialog.portal-modal').getByRole('button',{name:'Close',exact:true}).click();
  });
  await check('live motion is automatic, bounded and uses existing colours',async()=>{
    // Phase 03: the accent is the shared design-system gold (saas/ds/tokens.css), one source for every portal.
    const accent=await page.locator('html').evaluate(e=>{const s=getComputedStyle(e);return {accent:s.getPropertyValue('--sp-accent').trim().toLowerCase(),gold:s.getPropertyValue('--sp-gold').trim().toLowerCase()}});assert.equal(accent.accent,accent.gold);assert.equal(accent.gold,'#e6b455');
    assert.ok(await page.locator('.sp-motion-visible').count()<=12);
    assert.equal(await page.locator('.sp-motion-toggle').count(),0);
    assert.equal(await page.locator('html').evaluate(e=>e.classList.contains('sp-motion-enabled')),true);
  });
  assert.equal(await page.locator('#workspace-operator-link').isVisible(),false,'subscriber owners do not receive the founder shortcut');
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
  await check('connected TikTok resources stay separate from controls and save exact selections',async()=>{
    let selected=['test-tiktok-account'],saved=null;
    const fixture=async route=>{const response=await route.fetch(),data=await response.json();const item=data.integrations.find(x=>x.provider==='tiktok');Object.assign(item,{status:'connected',provider_ready:true,account_label:'UI Test Account',resources:[{id:'test-tiktok-account',label:'UI Test Account',type:'tiktok_account'}],selected_resources:selected.map(id=>({id})),last_test_status:'pass'});await route.fulfill({response,json:data})};
    await page.route('**/api/saas/integrations/self-service',fixture);
    await page.route('**/api/saas/integrations/self-service/tiktok/resources',async route=>{saved=route.request().postDataJSON().resource_ids;selected=saved;await route.fulfill({json:{ok:true}})});
    await page.evaluate(()=>window.loadSelfServiceIntegrations(true));await page.evaluate(()=>window.SuperProIntegrationManager.enhance());
    const card=page.locator('[data-provider-card="tiktok"]');await card.locator('[data-im-resource]').waitFor();
    for(const width of [390,980,1440]){
      await page.setViewportSize({width,height:1200});await page.waitForTimeout(200);const {actions,picker,box,input}=await card.evaluate(card=>{const rect=selector=>{const e=selector?card.querySelector(selector):card;return e?JSON.parse(JSON.stringify(e.getBoundingClientRect())):null};return {actions:rect('.integration-manager-actions'),picker:rect('.integration-resource-picker'),box:rect(),input:rect('[data-im-resource]')}});assert.ok(actions&&picker&&box&&input,JSON.stringify({width,actions,picker,box,input}));assert.ok(picker.y>=actions.y+actions.height-1,JSON.stringify({width,actions,picker}));assert.ok(input.width>0&&input.width<=20&&input.height<=20,JSON.stringify(input));assert.ok(picker.x>=box.x&&picker.x+picker.width<=box.x+box.width+1);await screenshot(page,'connected-tiktok-'+width);
    }
    await card.locator('[data-im-resource]').uncheck();await card.getByRole('button',{name:'Save selection'}).click();await page.waitForFunction(()=>!document.querySelector('[data-provider-card="tiktok"] [data-im-save]')?.disabled);assert.deepEqual(saved,[]);
    await page.unrouteAll({behavior:'wait'});
  });
  await check('Import help opens on mobile and supported files reach the dry-run review',async()=>{
    await page.setViewportSize({width:390,height:900});await page.evaluate(()=>location.hash='setup/import');await page.locator('#migration-view').waitFor({state:'visible'});
    await page.locator('#migration-help').click();await page.locator('.gds-support-panel').waitFor({state:'visible'});await page.locator('.gds-support-close').click();
    await page.locator('#migration-entity').selectOption('workers');await page.locator('#migration-file').setInputFiles({name:'example.xlsx',mimeType:'application/octet-stream',buffer:Buffer.from('unsupported fixture')});await page.waitForFunction(()=>document.querySelector('#migration-file-info').textContent.includes('.csv or .json'));
    await page.locator('#migration-file').setInputFiles({name:'workers.csv',mimeType:'text/csv',buffer:Buffer.from('Full name,Email\nImport Preview Person,preview@example.test\n')});await page.locator('#migration-preview').waitFor({state:'visible'});await page.locator('#migration-preview').click();await page.locator('#migration-result-panel').waitFor({state:'visible'});assert.match(await page.locator('#migration-counts').innerText(),/Will create/);await screenshot(page,'import-dry-run-mobile');
  });
  await check('Finance, Billing, setup and exports stay organised across phone and desktop widths',async()=>{
    for(const width of [390,980]){
      await page.setViewportSize({width,height:1200});
      for(const view of ['finance','billing','onboarding','exports']){
        await page.evaluate(view=>location.hash=view,view);await page.locator('#'+view+'-view').waitFor({state:'visible'});await page.waitForTimeout(180);
        if(view==='billing'){for(const label of ['Payment connections','Usage & add-ons']){await page.locator('#billing-view').getByRole('tab',{name:label,exact:true}).click();await page.waitForTimeout(150);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await screenshot(page,'billing-'+label.replaceAll(' ','-')+'-'+width)}}
        if(view==='exports'){assert.ok(await page.locator('#export-backup').isVisible());const backup=await page.locator('.export-backup').boundingBox(),grid=await page.locator('.export-grid').boundingBox();assert.ok(backup.width>=grid.width-2)}
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),view+' '+width);await screenshot(page,view+'-organised-'+width);
      }
    }
  });
  await page.evaluate(()=>location.hash='customers/list');await page.waitForTimeout(100);
  await check('customer dialog fits mobile and Cancel works with required fields empty',async()=>{
    await page.setViewportSize({width:390,height:700});
    // Open using the actual customer control, then test native validation/cancel behavior.
    await page.locator('#cust-new').click();const dialog=page.locator('#cust-dialog');assert.ok(await dialog.isVisible());
    const b=await dialog.boundingBox();assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=391&&b.y+b.height<=701,JSON.stringify(b));
    await dialog.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await dialog.isVisible(),false);
  });
  await check('Smart setup and Eligibility engine controls reach their working sections',async()=>{
    await page.evaluate(()=>location.hash='setup/settings');await page.locator('#onboarding-view').waitFor({state:'visible'});await page.getByRole('button',{name:'Smart setup',exact:true}).click();assert.equal(await page.locator('#industry-search').evaluate(e=>e===document.activeElement),true);
    await page.evaluate(()=>location.hash='customers/jobs');await page.locator('#jobs-view').waitFor({state:'visible'});await page.getByRole('button',{name:'Eligibility engine',exact:true}).click();await page.locator('#workforce-view').waitFor({state:'visible'});
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
    await page.locator('[data-staff-permissions]').first().click();const access=page.locator('.sp-access-dialog');await access.waitFor({state:'visible'});
    await page.setViewportSize({width:980,height:2000});const bounds=await access.boundingBox(),formBounds=await access.locator('form').boundingBox();assert.ok(bounds.height<1100,JSON.stringify(bounds));assert.ok(bounds.y+bounds.height-formBounds.y-formBounds.height<45);await screenshot(page,'staff-access-compact');
    await access.locator('select[name=mode]').selectOption('custom');await access.locator('input[value="customers.read"]').check();await access.getByRole('button',{name:'Save this member’s access'}).click();await page.waitForFunction(()=>document.querySelector('#staff-access-note')?.textContent.startsWith('Saved.'));
    await access.locator('select[name=mode]').selectOption('role');await access.getByRole('button',{name:'Save this member’s access'}).click();await page.waitForTimeout(300);await access.getByRole('button',{name:'Close',exact:true}).click();

  });
  await check('employee sends an AI question and receives a text answer',async()=>{
    const employee=await browser.newContext();await employee.addInitScript(({slug,version})=>{Object.defineProperty(window,'SpeechRecognition',{value:undefined,configurable:true});Object.defineProperty(window,'webkitSpeechRecognition',{value:undefined,configurable:true});if(version)localStorage.setItem('superpro_release_seen:'+version,'1');localStorage.setItem('gds-tour-'+slug,'done')},{slug:me.organisation.slug,version:release.release?.version||''});try{
      const r=await employee.request.post(base+'/api/saas/login',{data:{email:'ui.employee@example.test',password}});assert.ok(r.ok());const employeeLegal=await (await employee.request.get(base+'/api/saas/legal')).json();assert.ok((await employee.request.post(base+'/api/saas/legal/accept',{data:{version:employeeLegal.version,agree:true}})).ok());
      const p=await employee.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/saas/workspace.html');await p.locator('#workspace').waitFor({state:'visible'});
      await p.evaluate(slug=>{localStorage.setItem(`gds-tour-${slug}`,'done');document.querySelectorAll('dialog[open]').forEach(d=>d.close())},me.organisation.slug);
      // The Home microphone must work with MediaRecorder even when the browser
      // does not provide the separate SpeechRecognition API. No real mic or
      // paid transcription provider is invoked by this regression.
      await p.evaluate(()=>{window.spOriginalAIClient=window.SuperProAIClient;window.spAskEvents=0;window.addEventListener('superpro:ask',()=>window.spAskEvents++);window.SuperProAIClient={...window.SuperProAIClient,listen:async({onListening})=>{onListening(true);onListening(false);return {text:'Review my assigned jobs'}},stopListening(){},isListening(){return false}}});
      assert.ok(await p.locator('.sp-ask-mic').isEnabled());await p.locator('.sp-ask-mic').click();await p.waitForFunction(()=>document.querySelector('#sp-ask-input').value==='Review my assigned jobs');assert.equal(await p.evaluate(()=>window.spAskEvents),0);
      await p.locator('#sp-ask-input').fill('');await p.evaluate(()=>{window.SuperProAIClient.listen=()=>new Promise(resolve=>window.spLateTranscript=resolve)});await p.locator('.sp-ask-mic').click();
      await p.evaluate(()=>{window.dispatchEvent(new CustomEvent('gds:viewchange',{detail:{view:'jobs'}}));window.spLateTranscript({text:'Cancelled old request'})});await p.waitForTimeout(50);assert.equal(await p.locator('#sp-ask-input').inputValue(),'');assert.equal(await p.locator('.sp-ask-mic').getAttribute('aria-pressed'),'false');
      await p.evaluate(()=>window.SuperProAIClient=window.spOriginalAIClient);
      await p.locator('#sp-ask-input').fill('How do I see my assigned work?');await p.locator('.sp-ask-send').click();
      await p.locator('[data-copilot-speaker]').click();
      await p.waitForFunction(()=>document.querySelectorAll('.copilot-message.ai:not(.waiting)').length>1);assert.ok((await p.locator('.copilot-message.ai').last().innerText()).length>30);
      assert.equal(await p.locator('.nav-item[data-view="team"]').count(),0);assert.equal(await p.locator('#workspace-operator-link').isVisible(),false);assert.match(await p.locator('#workspace-member-name').innerText(),/UI Test Employee/);
      await p.setViewportSize({width:390,height:844});assert.ok(await p.locator('#logout').isVisible());await p.locator('#logout').click();await p.waitForURL(base+'/');assert.equal((await employee.request.get(base+'/api/saas/me')).status(),401);

    }finally{await employee.request.post(base+'/api/saas/logout',{data:{}});await employee.close()}
  });
  await check('notification preferences and delivery activity are visible on mobile',async()=>{
    const releaseNotice=page.locator('#superpro-release-dialog');if(await releaseNotice.isVisible())await releaseNotice.getByRole('button',{name:'Got it',exact:true}).click();
    await page.locator('[aria-label="Notifications"]').click();const dialog=page.locator('#superpro-platform-notices');await dialog.waitFor({state:'visible'});
    // Notifications come first; settings are one compact row of toggles that save immediately; sound is on by default.
    assert.equal((await (await context.request.get(base+'/api/saas/notification-preferences')).json()).preferences.sound,true,'sound on by default');
    assert.ok(await dialog.evaluate(d=>d.querySelector('[data-platform-notice-list]').compareDocumentPosition(d.querySelector('.notice-prefs'))&Node.DOCUMENT_POSITION_FOLLOWING),'notifications are listed before the settings');
    assert.ok((await dialog.locator('.notice-prefs').boundingBox()).height<130,'settings row stays compact');
    const mute=dialog.locator('[data-pref=muted]');await mute.click();await page.waitForFunction(()=>document.querySelector('[data-preferences-status]')?.textContent==='Alerts muted.');
    assert.equal(await mute.getAttribute('aria-pressed'),'true');
    assert.equal((await (await context.request.get(base+'/api/saas/notification-preferences')).json()).preferences.muted,true);
    await mute.click();await page.waitForFunction(()=>document.querySelector('[data-preferences-status]')?.textContent==='Alerts on.');
    assert.equal((await (await context.request.get(base+'/api/saas/notification-preferences')).json()).preferences.muted,false);
    await dialog.locator('[data-delivery-tab]').click();await dialog.getByRole('heading',{name:'Delivery & follow-ups'}).waitFor();
    await dialog.locator('[data-notice-close]').click();
  });
  await check('staff sender identity, sent/seen receipts and compact availability work across sessions',async()=>{
    const employee=await browser.newContext();await employee.addInitScript(({slug,version})=>{Object.defineProperty(window,'SpeechRecognition',{value:undefined,configurable:true});Object.defineProperty(window,'webkitSpeechRecognition',{value:undefined,configurable:true});if(version)localStorage.setItem('superpro_release_seen:'+version,'1');localStorage.setItem('gds-tour-'+slug,'done')},{slug:me.organisation.slug,version:release.release?.version||''});try{
      assert.ok((await employee.request.post(base+'/api/saas/login',{data:{email:'ui.employee@example.test',password}})).ok());
      const p=await employee.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/saas/workspace.html');await p.locator('#workspace').waitFor({state:'visible'});await p.waitForFunction(()=>!!window.SuperProStaffChat);
      await p.evaluate(()=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());localStorage.setItem('superpro_copilot_voice','off')});
      await page.evaluate(()=>window.SuperProStaffChat.open());const chat=page.locator('#gds-staff-chat');await chat.locator('.sc-compose textarea').fill('Delivery receipt browser test');await chat.locator('.sc-send').click();await chat.locator('.sc-msg.mine').last().getByText('UI Test Owner',{exact:true}).waitFor();
      await p.evaluate(()=>window.SuperProStaffChat.open());await p.locator('.sc-bubble p').filter({hasText:'Delivery receipt browser test'}).waitFor();
      await chat.locator('.sc-msg.mine').last().locator('.sc-ticks').filter({hasText:'Seen'}).waitFor({timeout:12000});
      await chat.locator('.sc-team>summary').click();await chat.locator('.staff-status-editor>summary').click();await chat.locator('.staff-availability-form select').selectOption('busy');await chat.locator('input[name=reason]').fill('Reviewing enquiries');await chat.getByRole('button',{name:'Update my status'}).click();
      await chat.locator('.staff-directory-person').filter({hasText:'UI Test Owner'}).filter({hasText:'busy'}).waitFor();
      assert.ok((await employee.request.post(base+'/api/saas/logout',{data:{}})).ok());await page.bringToFront();
      await page.waitForFunction(()=>![...document.querySelectorAll('.staff-directory-list .staff-directory-person')].some(e=>e.textContent.includes('UI Test Employee')),{},{timeout:12000});
      await chat.locator('.staff-offline>summary').click();await chat.locator('.staff-offline-list .staff-directory-person').filter({hasText:'UI Test Employee'}).filter({hasText:'offline'}).waitFor();
      assert.ok(await chat.locator('.staff-directory-list').evaluate(e=>e.clientHeight<=120));await screenshot(page,'staff-chat-availability');await page.evaluate(()=>window.SuperProStaffChat.close());
    }finally{await employee.request.post(base+'/api/saas/logout',{data:{}});await employee.close()}
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
  await page.setViewportSize({width:390,height:900});
  page.on('response',r=>{if(r.url().startsWith(base+'/api/admin/')&&r.status()>=400)failedFounderRequests.push(r.status()+' '+new URL(r.url()).pathname)});
  await page.goto(base+'/saas/sign-in.html#operator');await page.locator('#operator-form input[name=key]').fill(adminKey);await page.locator('#operator-link-label').waitFor({state:'visible'});await page.locator('input[name=link_workspace]').check();await page.locator('#operator-form button[type=submit]').click();await page.waitForURL(base+'/office/');await page.locator('#console-nav [data-section]').first().waitFor({state:'attached'});
  await check('founder uses nine isolated groups and nested pages',async()=>{
    assert.equal(await page.locator('#console-nav [data-section]').count(),9);
    for(const section of ['f01','f02','f03','f04','f05','f06','f07','f08','f09']){await page.evaluate(h=>location.hash=h,section);await page.waitForTimeout(120);assert.ok(await page.locator('#console-nav .navigation-page').count()>0);assert.equal(await page.locator('#console-content').getByText('Action unavailable',{exact:true}).count(),0,section)}
    await page.evaluate(()=>location.hash='f01');await screenshot(page,'founder-mobile');await page.setViewportSize({width:1440,height:1000});await screenshot(page,'founder-desktop');
  });
  await check('founder API requests succeed across all sections',async()=>assert.deepEqual(failedFounderRequests,[]));
  await check('only the independently verified founder sees the workspace operator shortcut',async()=>{
    const me=await (await context.request.get(base+'/api/saas/me')).json();assert.equal(me.user.platform_owner,true);
    const account=await context.newPage();try{await account.goto(base+'/saas/workspace.html');await account.locator('#workspace').waitFor({state:'visible'});await account.locator('.portal-rail').hover();await account.waitForTimeout(220);assert.ok(await account.locator('#workspace-operator-link').isVisible());assert.equal(await account.locator('#workspace-operator-link').getAttribute('href'),'operator-sign-in.html')}finally{await account.close()}
  });
  await check('no browser JavaScript exceptions',async()=>assert.deepEqual(errors,[]));
  console.log(`UI CHECKS PASSED: ${results.length}`);
}finally{await browser?.close();child.kill('SIGTERM');await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));fs.rmSync(temp,{recursive:true,force:true});}
