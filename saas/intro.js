// Anchor navigation scrolls automatically without taking control away from the visitor.
document.querySelector('#back-top').addEventListener('click',event=>{event.preventDefault();window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});});
