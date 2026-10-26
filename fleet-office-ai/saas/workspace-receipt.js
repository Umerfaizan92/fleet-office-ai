// Take payment on the spot and give a receipt: QR / NFC tag for the customer's phone, print or thermal-printer receipts.
// Honest limits: a customer tapping their own CARD on your phone needs a card-reader app from Stripe, Zeller or Square. Browsers cannot
// read cards. What works here is the customer tapping their PHONE on an NFC tag, or scanning the QR, then paying with Apple Pay / Google Pay.
(()=>{
  const {el,api,money,note}=window.SuperProUI||{};if(!el)return;
  const store={get(k,d){try{return localStorage.getItem(k)||d}catch{return d}},set(k,v){try{localStorage.setItem(k,v)}catch{}}};
  const SERVICES=['000018f0-0000-1000-8000-00805f9b34fb','0000ffe0-0000-1000-8000-00805f9b34fb','49535343-fe7d-4ae5-8fa9-9fafd205e455','e7810a71-73ae-499d-8c15-faa9aef0c3f2','0000ff00-0000-1000-8000-00805f9b34fb'];
  let printer=null; // { kind, name, write(bytes) }

  // ---------- receipt text ----------
  const ascii=s=>String(s||'').normalize('NFKD').replace(/[^\x20-\x7E]/g,'').trim();
  const width=()=>Number(store.get('sp-paper','32'));
  const wrap=(t,w)=>{const out=[];let line='';for(const word of ascii(t).split(/\s+/)){if((line+' '+word).trim().length>w){if(line)out.push(line);line=word.slice(0,w)}else line=(line+' '+word).trim()}if(line)out.push(line);return out};
  const pair=(a,b,w)=>{a=ascii(a);b=ascii(b);const gap=Math.max(1,w-a.length-b.length);return a.length+b.length+1>w?a.slice(0,w-b.length-1)+' '+b:a+' '.repeat(gap)+b};
  const when=iso=>new Date(iso).toLocaleString('en-AU',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Australia/Perth'});
  function receiptLines(r){
    const w=width(),L=[];const c=t=>wrap(t,w).forEach(x=>L.push({t:x,center:true}));const rule=()=>L.push({t:'-'.repeat(w)});
    c(r.business);if(r.abn)c('ABN '+r.abn);rule();L.push({t:'RECEIPT '+(r.receipt_no||''),bold:true});L.push({t:when(r.paid_at)});rule();
    wrap(r.job,w).forEach(x=>L.push({t:x}));if(r.customer)L.push({t:'For: '+ascii(r.customer).slice(0,w-5)});
    L.push({t:pair('Paid by',r.method,w)});if(r.reference)L.push({t:pair('Ref',r.reference,w)});rule();
    L.push({t:pair('TOTAL PAID',money(r.amount_cents),w),bold:true});rule();c('Thank you');L.push({t:''});
    return L;
  }
  function escpos(lines){
    const b=[0x1B,0x40],enc=new TextEncoder();
    for(const l of lines){b.push(0x1B,0x61,l.center?1:0,0x1B,0x45,l.bold?1:0);b.push(...enc.encode(l.t),0x0A)}
    b.push(0x0A,0x0A,0x0A,0x1D,0x56,0x42,0x00);return new Uint8Array(b);
  }

  // ---------- printing ----------
  async function sendToPrinter(lines){
    if(!printer)throw new Error('Connect a receipt printer first.');
    const data=escpos(lines);for(let i=0;i<data.length;i+=64)await printer.write(data.slice(i,i+64));
  }
  function browserPrint(lines){
    const w=window.open('','_blank','width=380,height=640');if(!w){note('Allow pop-ups to print, or connect a receipt printer.',true);return}
    const esc=t=>String(t).replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Receipt</title><style>@page{size:${width()>32?'80mm':'58mm'} auto;margin:4mm}body{font:13px/1.35 ui-monospace,Menlo,Consolas,monospace;margin:0}pre{margin:0;white-space:pre-wrap}.c{text-align:center}.b{font-weight:700}</style><body>${lines.map(l=>`<pre class="${l.center?'c ':''}${l.bold?'b':''}">${esc(l.t)||'&nbsp;'}</pre>`).join('')}<script>onload=()=>{print();setTimeout(close,400)}<\/script>`);w.document.close();
  }
  async function printPayment(id){
    try{
      const {receipt}=await api(`/api/saas/payments/${encodeURIComponent(id)}/receipt-data`),lines=receiptLines(receipt);
      if(printer){await sendToPrinter(lines);note('Receipt sent to '+printer.name+'.')}else browserPrint(lines);
    }catch(e){note(e.message||'Could not print the receipt.',true)}
  }
  async function connectBluetooth(){
    if(!navigator.bluetooth)throw new Error('Bluetooth printing needs Chrome or Edge on Android or a computer. On iPhone, use Print receipt with an AirPrint printer.');
    const dev=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:SERVICES}),server=await dev.gatt.connect();
    let ch=null;for(const s of await server.getPrimaryServices()){for(const c of await s.getCharacteristics()){if(c.properties.write||c.properties.writeWithoutResponse){ch=c;break}}if(ch)break}
    if(!ch)throw new Error('That device does not look like a receipt printer.');
    printer={kind:'bluetooth',name:dev.name||'Bluetooth printer',write:b=>ch.properties.writeWithoutResponse?ch.writeValueWithoutResponse(b):ch.writeValue(b)};
  }
  async function connectUsb(){
    if(!navigator.usb)throw new Error('USB printing needs Chrome or Edge on a computer or Android.');
    const dev=await navigator.usb.requestDevice({filters:[]});await dev.open();if(!dev.configuration)await dev.selectConfiguration(1);
    let ep=null,ifn=null;for(const i of dev.configuration.interfaces){const a=i.alternates[0];const o=a.endpoints.find(e=>e.direction==='out'&&e.type==='bulk');if(o&&(a.interfaceClass===7||!ep)){ep=o;ifn=i.interfaceNumber;if(a.interfaceClass===7)break}}
    if(!ep)throw new Error('No printer connection was found on that device.');await dev.claimInterface(ifn);
    printer={kind:'usb',name:dev.productName||'USB printer',write:b=>dev.transferOut(ep.endpointNumber,b)};
  }

  // ---------- receipt printer panel (Payments tab) ----------
  function panel(){
    const status=el('p',{class:'muted',text:printer?`Connected: ${printer.name}.`:'No printer connected. Print receipt uses your normal printer.'});
    const run=fn=>async()=>{try{await fn();status.textContent=`Connected: ${printer.name}.`;note('Printer connected.')}catch(e){if(e&&e.name!=='NotFoundError')note(e.message||'Could not connect.',true)}};
    const paper=el('select',{},el('option',{value:'32',text:'58 mm paper'}),el('option',{value:'48',text:'80 mm paper'}));paper.value=store.get('sp-paper','32');paper.onchange=()=>store.set('sp-paper',paper.value);
    const test=el('button',{type:'button',class:'secondary-button compact',text:'Print a test receipt',onclick:async()=>{const lines=receiptLines({business:'Test receipt',abn:null,receipt_no:'TEST-0001',paid_at:new Date().toISOString(),job:'Printer check',customer:'',amount_cents:1250,method:'Test',reference:null});try{printer?await sendToPrinter(lines):browserPrint(lines)}catch(e){note(e.message,true)}}});
    return el('details',{class:'panel pay-settings-box'},el('summary',{text:'Receipt printer and tap to pay'}),
      el('div',{class:'pay-body'},
        el('h3',{text:'Receipt printer'}),status,
        el('p',{class:'muted',text:'Works with most Bluetooth or USB thermal receipt printers (ESC/POS). Chrome or Edge only. You may need to reconnect each time you open the page. Any other printer works with Print receipt.'}),
        el('div',{class:'pay-actions'},el('button',{type:'button',class:'secondary-button compact',text:'Connect Bluetooth printer',onclick:run(connectBluetooth)}),el('button',{type:'button',class:'secondary-button compact',text:'Connect USB printer',onclick:run(connectUsb)}),paper,test),
        el('h3',{text:'Tap to pay'}),
        el('p',{class:'muted',text:'When you ask for a payment, press "Customer pays on their phone". They scan the QR code, or tap their phone on an NFC tag you wrote, then pay with Apple Pay or Google Pay.'}),
        el('p',{class:'muted',text:'To take a card tap on your own phone, use the reader app from your provider (Stripe Tap to Pay, Zeller or Square) and record the sale here with "Already paid you?". Browsers cannot read cards, so this part needs the provider\'s app.'})));
  }

  // ---------- QR / NFC ----------
  async function open(url,cents){
    const dlg=el('dialog',{class:'modal tap-modal'});
    const qr=el('div',{class:'tap-qr',text:'Making the code…'});
    const link=el('input',{readonly:true,value:url,'aria-label':'Payment link'});
    const close=el('button',{type:'button',class:'secondary-button',text:'Close',onclick:()=>{dlg.close();dlg.remove()}});
    const nfcMsg=el('p',{class:'muted',role:'status'});
    const actions=[el('button',{type:'button',class:'secondary-button compact',text:'Copy link',onclick:async()=>{try{await navigator.clipboard.writeText(url);note('Copied.')}catch{link.select()}}})];
    if(navigator.share)actions.push(el('button',{type:'button',class:'secondary-button compact',text:'Share',onclick:()=>navigator.share({title:'Payment',url}).catch(()=>{})}));
    if('NDEFReader' in window)actions.push(el('button',{type:'button',class:'secondary-button compact',text:'Write to NFC tag',onclick:async()=>{try{nfcMsg.textContent='Hold a blank NFC tag against the back of this phone…';await new NDEFReader().write({records:[{recordType:'url',data:url}]});nfcMsg.textContent='Done. Anyone who taps this tag opens the payment page. Write a new tag for each job.'}catch(e){nfcMsg.textContent=e.name==='NotAllowedError'?'NFC permission was declined.':'Could not write the tag. Make sure NFC is on and the tag is writable.'}}}));
    else actions.push(el('span',{class:'muted',text:'NFC tag writing needs Chrome on an Android phone.'}));
    dlg.append(el('h2',{text:`Customer pays ${money(cents)}`}),qr,el('p',{class:'muted',text:'Ask the customer to scan this with their phone camera, or tap their phone on an NFC tag. They can pay with Apple Pay, Google Pay or a card.'}),link,el('div',{class:'pay-actions'},...actions),nfcMsg,el('div',{class:'dialog-actions'},close));
    dlg.addEventListener('close',()=>dlg.remove());document.body.append(dlg);dlg.showModal();
    try{const r=await api('/api/saas/payments/qr?text='+encodeURIComponent(url));const img=document.createElement('img');img.alt='QR code for the payment link';img.width=220;img.height=220;img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(r.svg);qr.replaceChildren(img)}catch(e){qr.textContent='The code could not be made. Use the link instead.'}
  }
  window.SuperProReceipt={panel,printPayment,receiptLines};
  window.SuperProTap={open};
})();
