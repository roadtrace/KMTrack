/* Existing async operations disable their triggering button. Reflect that state. */
document.addEventListener('click',event=>{
 const button=event.target.closest('button');if(!button||button.disabled)return;
 requestAnimationFrame(()=>{
  if(!button.isConnected||!button.disabled)return;
  button.classList.add('action-working');button.setAttribute('aria-busy','true');
  const observer=new MutationObserver(()=>{if(!button.disabled){button.classList.remove('action-working');button.removeAttribute('aria-busy');observer.disconnect();}});
  observer.observe(button,{attributes:true,attributeFilter:['disabled']});
 });
},true);
