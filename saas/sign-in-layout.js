// Keep the sign-in task first on phones and expose the full overview on larger layouts.
(()=>{
 const panel=document.querySelector('.signin-feature-disclosure'),toggle=document.querySelector('.signin-feature-toggle'),content=document.querySelector('.signin-feature-content');if(!panel||!toggle||!content)return;
 const setOpen=open=>{panel.classList.toggle('is-expanded',open);toggle.setAttribute('aria-expanded',String(open));content.hidden=!open};
 const desktop=matchMedia('(min-width:901px)');const sync=()=>setOpen(desktop.matches);sync();desktop.addEventListener('change',sync);toggle.addEventListener('click',()=>setOpen(toggle.getAttribute('aria-expanded')!=='true'));
})();
