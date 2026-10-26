// Loaded first on every page that opens dialogs. Only one modal dialog may be open at a time: a second modal that tries to open
// (product update, guided tour, terms prompt...) waits in line (unless the person just clicked something to open it) instead of stacking invisibly on top of the first and swallowing clicks.
(()=>{
  if(window.__spModalQueue||typeof HTMLDialogElement==='undefined')return;
  window.__spModalQueue=true;
  const original=HTMLDialogElement.prototype.showModal,queue=[];
  const openModals=(except)=>[...document.querySelectorAll('dialog[open]')].filter(d=>d!==except&&d.matches(':modal'));
  HTMLDialogElement.prototype.showModal=function(){
    if(this.open)return;
    const userOpened=navigator.userActivation?.isActive;
    if(openModals(this).length&&!userOpened&&!this.hasAttribute('data-modal-priority')){if(!queue.includes(this))queue.push(this);return}
    return original.call(this);
  };
  const next=()=>{
    if(openModals().length)return;
    while(queue.length){const d=queue.shift();if(d.isConnected&&!d.open){original.call(d);return}}
  };
  document.addEventListener('close',()=>setTimeout(next,60),true);
  document.addEventListener('cancel',()=>setTimeout(next,60),true);
  // a dialog removed from the page without closing must not block the line
  new MutationObserver(()=>{if(queue.length)next()}).observe(document.documentElement,{childList:true,subtree:true});
})();
