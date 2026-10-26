// Money > Get paid: ask customers for payment, record payments, see reminders, and connect Stripe / PayPal / bank details.
(()=>{
  const {el,api,money,onView,note}=window.SuperProUI;
  const $=s=>document.querySelector(s);
  const STATUS={pending:['Waiting','warn'],paid:['Paid','ok'],failed:['Failed','bad'],cancelled:['Cancelled','neutral'],expired:['Link expired','neutral'],refunded:['Refunded','neutral']};
  const WAY={stripe:'Card or wallet',paypal:'PayPal',bank:'Bank transfer',manual:'Recorded by you'};
  let S=null,O=null;
  const date=iso=>iso?new Date(iso).toLocaleDateString('en-AU',{day:'numeric',month:'short'}):'';
  const badge=(text,tone)=>el('span',{class:`pay-badge pay-${tone}`,text});
  const copy=async text=>{try{await navigator.clipboard.writeText(text);note('Copied.')}catch{note('Copy is blocked here. Select the link and copy it.',true)}};
  const tapBtn=(url,cents)=>el('button',{type:'button',class:'primary-button compact',text:'Customer pays on their phone (QR or tap)',onclick:()=>window.SuperProTap?.open(url,cents)});
  const field=(label,name,attrs={})=>el('label',{},el('span',{text:label}),el('input',{name,autocomplete:'off',...attrs}));
  const check=(label,name,on)=>el('label',{class:'fin-check'},el('input',{type:'checkbox',name,checked:on?true:null}),el('span',{text:label}));

  function ways(){const w=[];if(S.stripe.connected)w.push(['stripe','Card, Apple Pay or Google Pay (Stripe)']);if(S.paypal.connected)w.push(['paypal','PayPal']);if(S.bank.bsb&&S.bank.account_number)w.push(['bank','Bank transfer']);return w}

  function requestForm(j){
    const choices=ways();
    if(!choices.length)return el('p',{class:'muted',text:'Connect Stripe or PayPal, or add your bank details, under Payment settings below.'});
    const out=el('div',{class:'pay-result',hidden:true});
    const f=el('form',{class:'pay-form'},
      el('label',{},el('span',{text:'How should they pay?'}),el('select',{name:'provider'},...choices.map(([v,t])=>el('option',{value:v,text:t})))),
      field('Amount (AUD)','amount',{type:'number',min:'1',step:'0.01',max:String(j.owing_cents/100),value:String(j.owing_cents/100),required:true}),
      check('Send it to the customer now (email and text)','send',false),
      el('button',{class:'primary-button compact',type:'submit',text:'Ask for payment'}),out);
    f.onsubmit=async e=>{e.preventDefault();const x=f.elements,b=f.querySelector('button[type=submit]');b.disabled=true;
      try{const r=await api('/api/saas/payments/requests',{method:'POST',body:JSON.stringify({work_order_id:j.id,provider:x.provider.value,amount:Number(x.amount.value),send_to_customer:x.send.checked})});
        const kids=[];
        if(r.payment.checkout_url)kids.push(tapBtn(r.payment.checkout_url,r.payment.amount_cents),el('p',{},el('b',{text:'Payment link ready. '}),'Works on any phone. Apple Pay and Google Pay let the customer tap their phone to pay.'),el('input',{readonly:true,value:r.payment.checkout_url,'aria-label':'Payment link'}),el('div',{class:'pay-actions'},el('button',{type:'button',class:'secondary-button compact',text:'Copy link',onclick:()=>copy(r.payment.checkout_url)}),el('a',{class:'secondary-button compact',href:r.payment.checkout_url,target:'_blank',rel:'noopener noreferrer',text:'Open to pay on this phone'})));
        if(r.bank)kids.push(el('p',{},el('b',{text:'Bank transfer. '}),'Ask the customer to use this reference:'),el('pre',{class:'pay-pre',text:`${r.bank.details}\nReference: ${r.bank.reference}`}),el('p',{class:'muted',text:'Bank transfers cannot be detected automatically. When the money arrives, choose Record a payment and confirm it.'}));
        if(r.sent?.length)kids.push(el('p',{class:'muted',text:'Sent: '+r.sent.map(s=>`${s.channel} ${String(s.status).replaceAll('_',' ')}${s.reason?` (${s.reason.replaceAll('_',' ')})`:''}`).join(', ')}));
        out.replaceChildren(...kids);out.hidden=false;await load();
      }catch(err){note(err.message,true)}finally{b.disabled=false}};
    return f;
  }
  function recordForm(j,pending){
    const bankReq=pending.find(p=>p.provider==='bank'&&p.status==='pending');
    const f=el('form',{class:'pay-form'},
      el('label',{},el('span',{text:'How was it paid?'}),el('select',{name:'method'},...[['cash','Cash'],['eftpos','Card terminal (EFTPOS, Zeller, Square)'],['bank_transfer','Bank transfer'],['other','Other']].map(([v,t])=>el('option',{value:v,text:t,selected:bankReq&&v==='bank_transfer'?true:null})))),
      field('Amount received (AUD)','amount',{type:'number',min:'1',step:'0.01',max:String(j.owing_cents/100),value:String((bankReq?bankReq.amount_cents:j.owing_cents)/100),required:true}),
      field('Note (optional)','note',{maxlength:'200'}),
      el('button',{class:'secondary-button compact',type:'submit',text:bankReq?'Confirm bank transfer received':'Record a payment'}));
    f.onsubmit=async e=>{e.preventDefault();const x=f.elements;try{await api('/api/saas/payments/record',{method:'POST',body:JSON.stringify({work_order_id:j.id,amount:Number(x.amount.value),method:x.method.value,note:x.note.value||undefined,payment_id:bankReq?.id})});note('Payment recorded. The job and your profit figures are updated.');await load();window.SuperProFinance?.load?.()}catch(err){note(err.message,true)}};
    return f;
  }
  function owedCard(j,payments){
    const mine=payments.filter(p=>p.work_order_id===j.id),tone=j.overdue?'bad':'warn';
    return el('details',{class:'row-card fin-job'},
      el('summary',{},el('div',{},el('b',{text:j.title}),el('div',{class:'muted',text:[j.customer_name||'No customer saved',j.due_at?`due ${date(j.due_at)}`:'payment not requested yet'].join(' · ')})),
        el('span',{},j.overdue?badge(`${j.days_overdue} days overdue`,tone):j.pending_requests?badge('Waiting for customer','warn'):null),el('strong',{text:money(j.owing_cents)})),
      el('div',{class:'pay-body'},
        j.late_fee_cents?el('p',{class:'muted',text:`Includes a late fee of ${money(j.late_fee_cents)} added ${date(j.late_fee_applied_at)}.`}):null,
        !j.customer_email&&!j.customer_phone?el('p',{class:'muted',text:'No email or mobile saved for this customer, so messages cannot be sent. Add them in Customers.'}):null,
        el('div',{class:'pay-two'},el('div',{},el('h3',{text:'Ask for payment'}),requestForm(j)),el('div',{},el('h3',{text:'Already paid you?'}),recordForm(j,mine))),
        mine.filter(p=>p.status==='pending'&&p.provider!=='manual').map(p=>el('div',{class:'pay-line'},el('span',{text:`${WAY[p.provider]} request for ${money(p.amount_cents)}`}),...(p.checkout_url?[tapBtn(p.checkout_url,p.amount_cents)]:[]),el('button',{type:'button',class:'secondary-button compact',text:'Cancel',onclick:async()=>{try{await api(`/api/saas/payments/${p.id}/cancel`,{method:'POST'});await load()}catch(err){note(err.message,true)}}})))));
  }
  function historyRow(p){
    const [t,tone]=STATUS[p.status]||[p.status,'neutral'];
    return el('article',{class:'row-card'},el('header',{},el('div',{},el('b',{text:`${money(p.amount_cents)} · ${p.job_title}`}),el('div',{class:'muted',text:[p.customer_name,WAY[p.provider],date(p.paid_at||p.created_at),p.receipt_no].filter(Boolean).join(' · ')})),
      el('div',{class:'pay-actions'},badge(t,tone),p.status==='paid'?el('button',{type:'button',class:'secondary-button compact',text:'Print receipt',onclick:()=>window.SuperProReceipt?.printPayment(p.id)}):null,p.status==='paid'?el('button',{type:'button',class:'secondary-button compact',text:'Send receipt again',onclick:async()=>{try{const r=await api(`/api/saas/payments/${p.id}/receipt`,{method:'POST'});note('Receipt: '+r.sent.map(s=>`${s.channel} ${String(s.status).replaceAll('_',' ')}`).join(', '))}catch(err){note(err.message,true)}}}):null)),
      p.failure_reason?el('p',{class:'muted',text:p.failure_reason}):null);
  }
  const KIND={receipt:'Receipt',payment_request:'Payment request',customer_reminder:'Customer reminder',owner_reminder:'Reminder for you',payment_received:'Payment received',payment_review:'Needs your attention'};
  function noticeRow(n){return el('article',{class:`row-card pay-notice${n.channel==='in_app'&&!n.read_at?' unread':''}`},el('header',{},el('div',{},el('b',{text:n.subject||KIND[n.kind]||n.kind}),el('div',{class:'muted',text:`${KIND[n.kind]||n.kind} · ${n.channel==='in_app'?'In the app':n.channel==='email'?'Email to '+n.recipient:'Text to '+n.recipient} · ${date(n.created_at)}`})),badge({sent:'Sent',recorded:'Saved',failed:'Not delivered',not_configured:'Not set up'}[n.status]||n.status,n.status==='sent'||n.status==='recorded'?'ok':n.status==='failed'?'bad':'neutral')),el('p',{class:'muted',text:n.body}),n.detail?el('p',{class:'muted',text:'Why: '+String(n.detail).replaceAll('_',' ')}):null)}

  function settingsForm(){
    const f=el('form',{class:'pay-settings'},
      el('fieldset',{},el('legend',{text:'Card and wallet payments (Stripe)'}),
        el('p',{class:'muted',text:S.stripe.connected?`Connected: ${S.stripe.hint}. Money goes straight to your Stripe account and Stripe pays it out to your bank on your payout schedule.`:'Money goes straight to your own Stripe account. Paste a secret or restricted key from your Stripe dashboard.'}),
        field('Stripe secret key','stripe_secret_key',{type:'password',placeholder:S.stripe.connected?'Saved. Paste a new one to replace it':'sk_live_… or rk_live_…'}),
        field('Webhook signing secret','stripe_webhook_secret',{type:'password',placeholder:S.stripe.webhook_set?'Saved. Paste a new one to replace it':'whsec_…'}),
        el('p',{class:'muted'},'In Stripe, add this webhook address and send checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, checkout.session.expired and charge.refunded: ',el('code',{text:S.stripe.webhook_url})),
        el('div',{class:'pay-actions'},el('button',{type:'button',class:'secondary-button compact',text:'Copy webhook address',onclick:()=>copy(S.stripe.webhook_url)}),S.stripe.connected?el('button',{type:'button',class:'secondary-button compact',text:'Test connection',onclick:()=>testProvider('stripe')}):null,S.stripe.connected?el('button',{type:'button',class:'secondary-button compact',text:'Disconnect',onclick:()=>save({disconnect:'stripe'})}):null)),
      el('fieldset',{},el('legend',{text:'PayPal'}),
        el('p',{class:'muted',text:S.paypal.connected?`Connected (${S.paypal.client_id_hint}).`:'Use the REST app credentials from developer.paypal.com.'}),
        field('Client ID','paypal_client_id',{type:'password',placeholder:S.paypal.connected?'Saved. Paste a new one to replace it':''}),field('Client secret','paypal_client_secret',{type:'password'}),field('Webhook ID','paypal_webhook_id',{placeholder:S.paypal.webhook_set?'Saved':''}),
        check('Use live PayPal (untick for the PayPal sandbox)','paypal_live',S.paypal.live),
        el('p',{class:'muted'},'PayPal webhook address: ',el('code',{text:S.paypal.webhook_url}),'. Send CHECKOUT.ORDER.APPROVED and PAYMENT.CAPTURE.COMPLETED.'),
        el('div',{class:'pay-actions'},S.paypal.connected?el('button',{type:'button',class:'secondary-button compact',text:'Test connection',onclick:()=>testProvider('paypal')}):null,S.paypal.connected?el('button',{type:'button',class:'secondary-button compact',text:'Disconnect',onclick:()=>save({disconnect:'paypal'})}):null)),
      el('fieldset',{},el('legend',{text:'Bank transfer details'}),el('p',{class:'muted',text:'Shown to customers who choose to pay by bank transfer. Bank transfers are confirmed by you.'}),
        field('Account name','bank_account_name',{value:S.bank.account_name,maxlength:'80'}),field('BSB','bank_bsb',{value:S.bank.bsb,placeholder:'000-000'}),field('Account number','bank_account_number',{value:S.bank.account_number,inputmode:'numeric'}),field('PayID (optional)','payid',{value:S.bank.payid})),
      el('fieldset',{},el('legend',{text:'Payment terms and reminders'}),
        field('Days to pay before a job is overdue','terms_days',{type:'number',min:'1',max:'90',value:S.terms_days}),
        check('Add a late fee to jobs that are not paid in time','late_fee_enabled',S.late_fee_enabled),field('Late fee (% of the job total, charged once)','late_fee_percent',{type:'number',min:'0',max:'25',step:'0.5',value:S.late_fee_percent}),
        check('My quotes or terms tell customers about this late fee before work starts','late_fee_terms_acknowledged',S.late_fee_acknowledged),
        el('p',{class:'muted',text:'Late fees must be agreed in advance and be a fair amount. Check your terms with an adviser. Super Pro applies the fee only when you have confirmed this.'}),
        check('Remind me about unpaid jobs (in the app, by email and by text)','owner_reminders',S.owner_reminders),
        check('Send friendly reminders to customers by email and text','customer_reminders',S.customer_reminders),
        el('p',{class:'muted',text:`Email ${S.channels.email?'is set up':'is not set up on this server yet'}. Text messages ${S.channels.sms?'are set up':'are not set up on this server yet'}. Messages that cannot be delivered are listed under Messages and reminders.`})),
      el('button',{class:'primary-button',type:'submit',text:'Save payment settings'}));
    f.onsubmit=e=>{e.preventDefault();const x=f.elements,body={};
      for(const n of ['stripe_secret_key','stripe_webhook_secret','paypal_client_id','paypal_client_secret','paypal_webhook_id'])if(x[n].value.trim())body[n]=x[n].value.trim();
      for(const n of ['bank_account_name','bank_bsb','bank_account_number','payid'])body[n]=x[n].value.trim();
      Object.assign(body,{paypal_live:x.paypal_live.checked,terms_days:Number(x.terms_days.value),late_fee_enabled:x.late_fee_enabled.checked,late_fee_percent:Number(x.late_fee_percent.value),customer_reminders:x.customer_reminders.checked,owner_reminders:x.owner_reminders.checked});
      if(x.late_fee_terms_acknowledged.checked)body.late_fee_terms_acknowledged=true;
      save(body)};
    return f;
  }
  async function save(body){try{const r=await api('/api/saas/payments/settings',{method:'PUT',body:JSON.stringify(body)});S=r.settings;note('Payment settings saved.');await load()}catch(err){note(err.message,true)}}
  async function testProvider(provider){try{const r=await api('/api/saas/payments/settings/test',{method:'POST',body:JSON.stringify({provider})});note(r.message)}catch(err){note(err.message,true)}}
  const kpi=(label,value,sub,tone)=>el('article',{class:`panel finance-kpi fin-${tone||'plain'}`},el('small',{text:label}),el('strong',{text:value}),sub?el('span',{text:sub}):null);

  async function load(){
    const host=$('#pay-root');if(!host)return;
    try{
      const [s,o,p]=await Promise.all([api('/api/saas/payments/settings'),api('/api/saas/payments/overview'),api('/api/saas/payments')]);
      S=s.settings;O=o;const t=o.totals;
      const open=[...host.querySelectorAll('details[open]')].map(d=>d.querySelector('summary b')?.textContent||d.querySelector('summary')?.textContent);
      const tab=document.querySelector('[data-fin-tab="payments"]');if(tab)tab.dataset.unread=o.unread_notices||'';
      const settingsBox=el('details',{class:'panel pay-settings-box'},el('summary',{text:'Payment settings: connect Stripe or PayPal, bank details, late fees'}),settingsForm());
      host.replaceChildren(...[
        el('div',{class:'finance-kpi-grid'},kpi('Waiting to be paid',money(t.unpaid_cents),`${t.unpaid_count} job${t.unpaid_count===1?'':'s'}`,t.unpaid_cents?'warn':'plain'),kpi('Overdue',money(t.overdue_cents),`${t.overdue_count} job${t.overdue_count===1?'':'s'}`,t.overdue_count?'bad':'plain'),kpi('Received, last 30 days',money(t.paid_30d_cents),'Counted in your profit automatically','good'),kpi('Late fees added',money(t.late_fees_cents),o.terms.late_fee_enabled?`${o.terms.late_fee_percent}% after ${o.terms.days} days`:'Late fees are off')),
        !ways().length?el('article',{class:'panel pay-callout'},el('b',{text:'Set up how you get paid'}),el('p',{text:'Connect your Stripe or PayPal account, or add bank details, to send payment links. Your customers pay you directly.'})):null,
        el('article',{class:'panel list-panel'},el('div',{class:'panel-head'},el('div',{},el('span',{class:'panel-kicker',text:'MONEY OWED TO YOU'}),el('h2',{text:'Unpaid jobs'})),el('button',{type:'button',class:'secondary-button compact',text:'Check reminders now',onclick:async()=>{try{const r=await api('/api/saas/payments/run-cycle',{method:'POST'});note(`Checked ${r.summary.checked} jobs. ${r.summary.fees_applied} late fee${r.summary.fees_applied===1?'':'s'} added, ${r.summary.notices} new message${r.summary.notices===1?'':'s'}.`);await load()}catch(err){note(err.message,true)}}})),
          el('div',{class:'record-list'},...(o.unpaid.length?o.unpaid.map(j=>owedCard(j,p.payments)):[el('div',{class:'empty-state'},el('b',{text:'Nothing is waiting to be paid'}),el('span',{text:'Jobs with a price and a balance appear here.'}))]))),
        el('article',{class:'panel list-panel'},el('div',{class:'panel-head'},el('div',{},el('span',{class:'panel-kicker',text:'PAYMENT HISTORY'}),el('h2',{text:'Payments'}))),el('div',{class:'record-list'},...(p.payments.length?p.payments.slice(0,50).map(historyRow):[el('div',{class:'empty-state'},el('b',{text:'No payments yet'}),el('span',{text:'Requests and receipts show here with their status.'}))]))),
        el('article',{class:'panel list-panel'},el('div',{class:'panel-head'},el('div',{},el('span',{class:'panel-kicker',text:'MESSAGES AND REMINDERS'}),el('h2',{text:'What was sent'})),o.unread_notices?el('button',{type:'button',class:'secondary-button compact',text:'Mark all as seen',onclick:async()=>{await api('/api/saas/payments/notices/read',{method:'POST'});await load()}}):null),el('div',{class:'record-list'},...(o.notices.length?o.notices.map(noticeRow):[el('div',{class:'empty-state'},el('b',{text:'No messages yet'}),el('span',{text:'Receipts and reminders are listed here, including any that could not be delivered.'}))]))),
        window.SuperProReceipt?window.SuperProReceipt.panel():null,
        settingsBox,
        el('article',{class:'panel pay-callout'},el('b',{text:'How getting paid works'}),el('ul',{},el('li',{text:'Payments land in your own Stripe or PayPal account. Choose daily, weekly or instant payouts to your bank in that account.'}),el('li',{text:'Card, Apple Pay and Google Pay payments are confirmed by the provider, so the job is marked paid by itself and your profit updates.'}),el('li',{text:'Customers can tap their phone with Apple Pay or Google Pay on the payment link. Taking a physical card tap on your own phone needs the Stripe or Zeller app, so record those with “Already paid you?”.'}),el('li',{text:'Bank transfers and cash are confirmed by you, because a bank does not tell Super Pro when money arrives.'})))].filter(Boolean));
      for(const d of host.querySelectorAll('details.row-card'))if(open.includes(d.querySelector('summary b')?.textContent))d.open=true;
    }catch(err){host.replaceChildren(el('p',{class:'muted',text:err.message}))}
  }
  document.addEventListener('click',e=>{if(e.target.closest('[data-fin-tab="payments"]'))load()});
  onView('finance',{enter:()=>{if(document.querySelector('[data-fin-tab="payments"].active'))load()}});
  window.SuperProPayments={load};
})();
