// Pre-fills the referral code field from ?ref= or the stored code. Kept as an external file so the CSP can forbid inline scripts.
document.addEventListener("DOMContentLoaded",()=>{const x=document.querySelector("#referral-code");if(x){const q=new URLSearchParams(location.search).get("ref")||sessionStorage.getItem("superpro_referral_code");if(q)x.value=q.toUpperCase()}})
