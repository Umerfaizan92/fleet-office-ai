(()=>{
  const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
  const button=$('#install-superpro'), status=$('#install-status'), readiness=$('#install-readiness'), detail=$('#install-detail');
  if(!button||!status||!readiness||!detail)return;
  let deferredInstall=null;
  const ua=navigator.userAgent||'';
  const ios=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const android=/Android/i.test(ua);
  const mobile=ios||android||/Mobile/i.test(ua);
  const edge=/Edg\//.test(ua), chrome=/Chrome\//.test(ua)&&!edge, safari=/Safari\//.test(ua)&&!/Chrome|Chromium|Edg\//.test(ua);
  const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const setStatus=(text,ready='false')=>{status.textContent=text;readiness.textContent=ready==='installed'?'Installed on this device':ready==='true'?'Direct install ready':'Install guidance ready';readiness.dataset.ready=ready};
  const show=(title,html)=>{detail.hidden=false;detail.innerHTML=`<h3>${title}</h3>${html}`;detail.focus({preventScroll:true});detail.scrollIntoView({behavior:'smooth',block:'nearest'})};
  const serviceWorkerState=async()=>{
    if(!('serviceWorker' in navigator))return 'Service workers are not supported by this browser.';
    try{const reg=await navigator.serviceWorker.getRegistration('/saas/');return reg?'Public app shell protection is active.':'The public app shell will be registered after the page finishes loading.'}catch{return 'Service-worker status could not be read on this device.'}
  };
  const platformSteps=kind=>{
    if(kind==='security')return serviceWorkerState().then(sw=>show('Secure-by-default install',`<p><strong>${sw}</strong></p><ul><li>The service worker caches only public Super Pro pages and static public assets.</li><li><strong>Private workspace, sign-in, registration/verification pages, Office Manager routes and all <code>/api/</code> requests stay network-only.</strong></li><li>Installing the PWA does not copy customer, employee, finance or private workspace records into the public offline cache.</li></ul><div class="install-detail-actions"><a href="trust-center.html">Open Trust Center</a></div>`));
    if(kind==='desktop'){
      if(standalone())return Promise.resolve(show('Desktop & laptop',`<p><strong>Super Pro is already running in installed-app mode on this device.</strong></p><p>You can keep using this window or launch it again from your operating system's app list.</p>`));
      if(deferredInstall)return Promise.resolve(show('Desktop & laptop',`<p><strong>This browser has approved direct PWA installation.</strong></p><ol><li>Select <b>Install Super Pro</b> below.</li><li>Confirm the browser install prompt.</li><li>Launch Super Pro from your desktop/start menu/app launcher.</li></ol><div class="install-detail-actions"><button type="button" data-install-now>Install now</button></div>`));
      const browser=edge?'Microsoft Edge':chrome?'Google Chrome':safari?'Safari':'this browser';
      return Promise.resolve(show('Desktop & laptop',`<p>Direct install is not currently being offered by ${browser} on this page.</p><ol><li>Keep this page on HTTPS (or localhost for development).</li><li>Open the browser menu.</li><li>Choose <b>${safari?'Add to Dock':'Install app / Install Super Pro'}</b> when available.</li></ol><p>The button will switch to direct install automatically if the browser emits an install prompt.</p>`));
    }
    if(ios)return Promise.resolve(show('Mobile & tablet — iPhone/iPad',`<p>iOS/iPadOS normally uses Safari's Home Screen flow rather than a web install prompt.</p><ol><li>Open this page in <b>Safari</b>.</li><li>Tap the <b>Share</b> button.</li><li>Choose <b>Add to Home Screen</b>.</li><li>Confirm <b>Add</b>.</li></ol>`));
    if(android&&deferredInstall)return Promise.resolve(show('Mobile & tablet — Android',`<p><strong>Direct installation is ready on this Android device.</strong></p><ol><li>Select <b>Install Super Pro</b>.</li><li>Confirm the browser prompt.</li><li>Open Super Pro from your Home Screen/app launcher.</li></ol><div class="install-detail-actions"><button type="button" data-install-now>Install now</button></div>`));
    return Promise.resolve(show('Mobile & tablet',`<p>Use your browser's install or Home Screen option.</p><ol><li>Open the browser menu or Share menu.</li><li>Choose <b>Add to Home Screen</b> or <b>Install app</b> where supported.</li><li>Confirm the shortcut/app.</li></ol>`));
  };
  async function promptInstall(){
    if(standalone()){setStatus('Super Pro is already installed and running in standalone mode.','installed');await platformSteps(mobile?'mobile':'desktop');return}
    if(!deferredInstall){setStatus('This browser is not offering a direct install prompt right now. Open the device-specific steps below.','false');await platformSteps(mobile?'mobile':'desktop');return}
    button.disabled=true;setStatus('Opening the secure browser install prompt…','true');
    try{deferredInstall.prompt();const result=await deferredInstall.userChoice;if(result.outcome==='accepted'){setStatus('Installation was accepted. Your browser will finish adding Super Pro.','installed')}else setStatus('Installation was not completed. You can try again from your browser menu.','false')}catch{setStatus('The browser install prompt could not be opened. Use the device-specific steps below.','false');await platformSteps(mobile?'mobile':'desktop')}finally{deferredInstall=null;button.disabled=standalone()}
  }
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;if(!standalone()){button.disabled=false;setStatus('Direct installation is available on this device.','true')}});
  window.addEventListener('appinstalled',()=>{deferredInstall=null;button.disabled=true;setStatus('Super Pro was installed successfully on this device.','installed')});
  button.addEventListener('click',promptInstall);
  $$('[data-install-help]').forEach(x=>x.addEventListener('click',()=>platformSteps(x.dataset.installHelp)));
  detail.addEventListener('click',e=>{if(e.target.closest('[data-install-now]'))promptInstall()});
  if(standalone()){button.disabled=true;setStatus('Super Pro is already installed and running as an app.','installed')}
  else if(ios){setStatus('On iPhone/iPad, install from Safari → Share → Add to Home Screen.','false')}
  else{setStatus('Waiting for this browser to confirm direct-install eligibility.','false');setTimeout(()=>{if(!deferredInstall&&!standalone())setStatus('Use Install Super Pro if it becomes available, or open the device-specific steps above.','false')},1400)}
})();
