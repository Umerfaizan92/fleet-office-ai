/* Public website behaviour (Phase 03): navigation, 3D hero loading, AI demo, scroll story, approval-gate demo,
   receptionist sample call, help search, testimonials, newsletter and contact forms. No dependencies. */
(() => {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ready = (fn) => (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn) : fn());

  ready(() => {
    $$('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });

    /* ---------- navigation ---------- */
    const nav = $('[data-nav]'), toggle = $('[data-nav-toggle]');
    toggle?.addEventListener('click', () => {
      const open = !nav.hasAttribute('data-open');
      nav.toggleAttribute('data-open', open); toggle.setAttribute('aria-expanded', String(open));
      if (open) $('#sp-nav-links a')?.focus();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav?.hasAttribute('data-open')) { nav.removeAttribute('data-open'); toggle?.setAttribute('aria-expanded', 'false'); toggle?.focus(); } });

    /* ---------- 3D hero: only on capable devices, after the page has loaded, never for reduced motion ---------- */
    const hero = $('[data-hero3d]');
    if (hero) {
      const conn = navigator.connection || {};
      const forced = /[?&]force3d=1/.test(location.search);
      const capable = !reduce() && (forced || matchMedia('(min-width: 760px)').matches) && !conn.saveData && !/2g/.test(conn.effectiveType || '') && (navigator.hardwareConcurrency || 4) >= 4 && (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } })();
      if (capable && !/[?&]static3d=1/.test(location.search)) {
        const go = () => import('/saas/ds/hero-3d.js?v=20261030').then((m) => m.mountHero(hero, { quality: innerWidth < 760 || (navigator.deviceMemory || 8) < 4 ? 'low' : 'high' })).catch(() => {});
        const idle = window.requestIdleCallback || ((f) => setTimeout(f, 300));
        if (document.readyState === 'complete') idle(go, { timeout: 2500 }); else addEventListener('load', () => idle(go, { timeout: 2500 }), { once: true });
      }
    }

    /* ---------- AI demo (uses the existing product guide; falls back to its verified local answers) ---------- */
    const demo = $('[data-ai-demo]');
    if (demo) {
      const log = $('[data-ai-log]', demo), form = $('[data-ai-form]', demo), input = $('input', form), state = $('[data-ai-state]', demo), live = $('[data-ai-live]', demo);
      const add = (cls, html) => { const d = document.createElement('div'); d.className = 'sp-msg ' + cls; d.innerHTML = html; log.append(d); log.scrollTop = log.scrollHeight; return d; };
      let busy = false;
      async function ask(q) {
        q = String(q || '').trim(); if (!q || busy) return;
        busy = true; demo.setAttribute('data-busy', ''); state.textContent = 'Thinking';
        add('sp-msg--me', `<p>${esc(q)}</p>`);
        const pending = add('sp-msg--ai', '<span class="sp-typing" aria-label="Writing an answer"><i></i><i></i><i></i></span>');
        try {
          const guide = window.GDSProductGuide;
          const r = guide?.answerAsync ? await guide.answerAsync(q, 'public') : null;
          const text = String(r?.text || 'I can explain enquiries, quotes, jobs, approvals, staff and payments. Try one of the suggestions.');
          pending.innerHTML = text.split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join('');
          voice.say(text);
        } catch { pending.innerHTML = '<p>I could not answer just now. Try again, or see the help centre.</p>'; }
        busy = false; demo.removeAttribute('data-busy'); state.textContent = 'Ready'; window.SPMotion?.pulse(live);
      }
      form.addEventListener('submit', (e) => { e.preventDefault(); const q = input.value; input.value = ''; ask(q); });
      $$('[data-ai-prompts] button', demo).forEach((b) => b.addEventListener('click', () => ask(b.textContent)));
      // Voice: speak a question (server transcription, else the browser's recogniser) and hear answers read aloud
      // (server voice, else the device voice). Nothing records until the microphone is pressed.
      const voice = (() => {
        const mic = $('[data-ai-mic]', demo), speakBtn = $('[data-ai-speak]', demo);
        const lang = (document.documentElement.lang || navigator.language || 'en').slice(0, 5);
        let status = { voice: false, transcribe: false }, reading = false, audio = null, rec = null, chunks = [], timer = null, recog = null;
        const Recog = window.SpeechRecognition || window.webkitSpeechRecognition;
        const note = (t) => { let n = $('.sp-chat__voice-note', demo); if (!n) { n = document.createElement('p'); n.className = 'sp-chat__voice-note'; n.setAttribute('role', 'status'); form.before(n); } n.textContent = t; n.hidden = !t; };
        const setReading = (on) => { reading = on; speakBtn?.setAttribute('aria-pressed', String(on)); if (!on) stopAudio(); };
        const stopAudio = () => { try { audio?.pause(); } catch {} audio = null; try { speechSynthesis.cancel(); } catch {} };
        const browserSay = (t) => { if (!('speechSynthesis' in window)) return; const u = new SpeechSynthesisUtterance(t); u.lang = lang; speechSynthesis.speak(u); };
        async function say(text) {
          if (!reading || !text) return; stopAudio(); const t = String(text).slice(0, 1800);
          if (status.voice) {
            try { const r = await fetch('/api/product-guide/speech', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: t, language: lang.slice(0, 2), voice: 'auto' }) });
              if (r.ok) { const url = URL.createObjectURL(await r.blob()); audio = new Audio(url); audio.onended = () => URL.revokeObjectURL(url); await audio.play(); return; } } catch {}
          }
          browserSay(t);
        }
        speakBtn?.addEventListener('click', () => { setReading(!reading); note(reading ? 'Answers will be read aloud.' : ''); });
        const setMic = (on) => { mic?.setAttribute('aria-pressed', String(on)); mic?.setAttribute('aria-label', on ? 'Stop and send' : 'Speak your question'); };
        async function sendRecording(blob) {
          if (blob.size < 700) { note('That was too short. Press the microphone and speak again.'); return; }
          note('Understanding what you said…');
          try { const fd = new FormData(); fd.append('audio', blob, 'speech.webm'); fd.append('language', 'auto');
            const r = await fetch('/api/product-guide/transcribe', { method: 'POST', credentials: 'same-origin', body: fd }); const d = await r.json().catch(() => ({}));
            const q = String(d.text || '').trim(); if (!r.ok || !q) { note('Sorry, I did not catch that. Please try again or type your question.'); return; }
            note(''); setReading(true); ask(q);
          } catch { note('Voice is unavailable just now. Please type your question.'); }
        }
        async function toggleMic() {
          if (rec) { rec.stop(); return; }
          if (recog) { recog.stop(); return; }
          stopAudio();
          if (status.transcribe && window.MediaRecorder && navigator.mediaDevices?.getUserMedia) {
            try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); chunks = []; rec = new MediaRecorder(stream);
              rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
              rec.onstop = () => { clearTimeout(timer); stream.getTracks().forEach((t) => t.stop()); const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' }); rec = null; setMic(false); sendRecording(blob); };
              rec.start(); setMic(true); note('Listening… press the microphone again when you finish.'); timer = setTimeout(() => rec?.stop(), 15000); return;
            } catch { rec = null; setMic(false); note('Microphone access was not allowed. You can type your question instead.'); return; }
          }
          if (Recog) {
            recog = new Recog(); recog.lang = lang; recog.interimResults = false; recog.maxAlternatives = 1;
            recog.onresult = (e) => { const q = e.results?.[0]?.[0]?.transcript || ''; if (q.trim()) { note(''); setReading(true); ask(q); } };
            recog.onerror = () => note('Sorry, I did not catch that. Please try again or type your question.');
            recog.onend = () => { recog = null; setMic(false); };
            recog.start(); setMic(true); note('Listening…'); return;
          }
          note('Voice input is not available in this browser. Please type your question.');
        }
        mic?.addEventListener('click', toggleMic);
        fetch('/api/product-guide/status', { credentials: 'same-origin', cache: 'no-store' }).then((r) => r.json()).then((d) => { if (d?.ok) status = { voice: !!d.voice_server_ready, transcribe: !!d.transcription_server_ready }; }).catch(() => {}).finally(() => {
          if (mic) mic.hidden = !((status.transcribe && window.MediaRecorder && navigator.mediaDevices?.getUserMedia) || Recog);
          if (speakBtn) speakBtn.hidden = !(status.voice || 'speechSynthesis' in window);
        });
        return { say };
      })();
    }

    /* ---------- scroll story: the device shows what the current step has produced ---------- */
    const story = $('[data-story]');
    if (story) {
      const order = $$('[data-step]', story).map((s) => s.dataset.step);
      const items = $$('[data-feed]', story);
      const show = (step) => {
        const upto = order.indexOf(step);
        items.forEach((it) => {
          const at = order.indexOf(it.dataset.feed);
          it.dataset.state = at > upto ? 'hidden' : at === upto ? (/(draft|book|done)/.test(it.dataset.feed) ? 'gate' : 'ai') : 'shown';
        });
      };
      story.addEventListener('sp:step', (e) => show(e.detail.step));
      show(order[0]);
      if (reduce()) items.forEach((it) => { it.dataset.state = 'shown'; });
    }

    /* ---------- approval-gate demo ---------- */
    const flow = $('[data-flow]');
    if (flow) {
      const tabs = $$('[data-flow-tab]', flow), panels = $$('[data-flow-panel]', flow);
      const run = (panel) => {
        const steps = $$('.sp-flow__step', panel), status = $('[data-flow-status]', panel), approve = $('[data-flow-approve]', panel);
        steps.forEach((s) => { s.removeAttribute('data-on'); s.removeAttribute('data-waiting'); });
        approve.disabled = true; status.textContent = 'Working…';
        const gateAt = steps.findIndex((s) => s.dataset.kind === 'gate');
        let i = 0;
        const next = () => {
          if (i < gateAt) { steps[i].setAttribute('data-on', ''); i += 1; panel._t = setTimeout(next, reduce() ? 0 : 650); return; }
          steps[gateAt].setAttribute('data-waiting', ''); approve.disabled = false; status.textContent = 'Waiting for your approval';
        };
        clearTimeout(panel._t); next();
        approve.onclick = () => {
          approve.disabled = true; steps[gateAt].removeAttribute('data-waiting');
          for (let k = gateAt; k < steps.length; k += 1) steps[k].setAttribute('data-on', '');
          status.textContent = 'Approved. Done.'; window.SPMotion?.toast('Approved. In Super Pro this is recorded in your activity log.');
        };
        $('[data-flow-reset]', panel).onclick = () => run(panel);
      };
      const select = (key) => {
        tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.flowTab === key)));
        panels.forEach((p) => { p.hidden = p.dataset.flowPanel !== key; if (!p.hidden) run(p); });
      };
      tabs.forEach((t, idx) => {
        t.addEventListener('click', () => select(t.dataset.flowTab));
        t.addEventListener('keydown', (e) => { const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return; const n = tabs[(idx + d + tabs.length) % tabs.length]; n.focus(); select(n.dataset.flowTab); });
      });
      const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); run(panels.find((p) => !p.hidden)); } }, { threshold: 0.35 });
      io.observe(flow);
    }

    /* ---------- receptionist sample call ---------- */
    const call = $('[data-call]');
    if (call) {
      const lines = $$('[data-line]', call), play = $('[data-call-play]', call), label = $('span', play);
      let i = 1, timer = 0;
      const stop = (done) => { clearTimeout(timer); call.removeAttribute('data-playing'); play.setAttribute('aria-pressed', 'false'); label.textContent = done ? 'Play again' : 'Resume'; play.querySelector('use')?.setAttribute('href', '/saas/ds/icons.svg#play'); };
      const step = () => {
        if (i >= lines.length) return stop(true);
        lines[i].hidden = false; lines[i].scrollIntoView({ block: 'nearest', behavior: reduce() ? 'auto' : 'smooth' }); i += 1;
        timer = setTimeout(step, reduce() ? 300 : Math.min(3200, 900 + lines[i - 1].textContent.length * 28));
      };
      play.addEventListener('click', () => {
        if (call.hasAttribute('data-playing')) return stop(false);
        if (i >= lines.length) { i = 1; lines.slice(1).forEach((l) => { l.hidden = true; }); }
        call.setAttribute('data-playing', ''); play.setAttribute('aria-pressed', 'true'); label.textContent = 'Pause'; play.querySelector('use')?.setAttribute('href', '/saas/ds/icons.svg#pause');
        step();
      });
      $('[data-call-all]', call).addEventListener('click', (e) => { stop(true); lines.forEach((l) => { l.hidden = false; }); i = lines.length; e.currentTarget.hidden = true; });
    }

    /* ---------- help search ---------- */
    const search = $('[data-help-search]');
    if (search) {
      const faqs = $$('.sp-help .sp-faq'), groups = $$('.sp-help__group'), empty = $('[data-help-empty]'), count = $('[data-help-count]');
      search.addEventListener('input', () => {
        const q = search.value.trim().toLowerCase(); let shown = 0;
        faqs.forEach((f) => { const hit = !q || f.textContent.toLowerCase().includes(q); f.hidden = !hit; if (hit) shown += 1; if (q && hit) f.open = true; if (!q) f.open = false; });
        groups.forEach((g) => { g.hidden = !$$('.sp-faq', g).some((f) => !f.hidden); });
        empty.hidden = shown > 0; count.textContent = q ? `${shown} answer${shown === 1 ? '' : 's'} found` : '';
      });
    }

    /* ---------- real testimonials only (empty file means the section stays hidden) ---------- */
    const testimonials = $('[data-testimonials]');
    if (testimonials) fetch('/saas/content/testimonials.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : [])).then((list) => {
      const real = (Array.isArray(list) ? list : []).filter((t) => t && t.approved === true && t.quote && t.name && t.business);
      if (!real.length) return;
      testimonials.innerHTML = real.map((t) => `<figure class="sp-card sp-quote"><blockquote>${esc(t.quote)}</blockquote><figcaption>${esc(t.name)}, ${esc(t.business)}${t.location ? `, ${esc(t.location)}` : ''}</figcaption></figure>`).join('');
      testimonials.hidden = false;
    }).catch(() => {});

    /* ---------- forms ---------- */
    const setStatus = (form, text, tone) => { const s = $('[data-status]', form); s.textContent = text; s.dataset.tone = tone || ''; };
    const busyBtn = (form, on) => { const b = $('button[type=submit]', form); b.classList.toggle('is-loading', on); b.disabled = on; };
    const validate = (form) => {
      let first = null;
      $$('input,select,textarea', form).forEach((el) => { const ok = el.checkValidity(); el.setAttribute('aria-invalid', String(!ok)); if (!ok && !first) first = el; });
      if (first) { first.focus(); setStatus(form, first.validationMessage || 'Check this field.', 'bad'); return false; }
      return true;
    };
    const post = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) }).then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }));

    const news = $('[data-newsletter]');
    news?.addEventListener('submit', async (e) => {
      e.preventDefault(); if (!validate(news)) return;
      busyBtn(news, true);
      const r = await post('/api/newsletter/subscribe', { email: news.email.value, source: 'public_site_v3' }).catch(() => ({ ok: false, data: {} }));
      busyBtn(news, false);
      if (r.ok) { setStatus(news, 'Subscribed. Thank you.', 'good'); news.reset(); } else setStatus(news, r.data.error || 'That did not work. Please try again.', 'bad');
    });

    const contact = $('[data-contact]');
    if (contact) {
      const topic = new URLSearchParams(location.search).get('topic');
      if (topic && $(`option[value="${CSS.escape(topic)}"]`, contact)) contact.topic.value = topic;
      contact.addEventListener('submit', async (e) => {
        e.preventDefault(); if (!validate(contact)) return;
        busyBtn(contact, true);
        const label = contact.topic.selectedOptions[0].textContent;
        const r = await post('/api/support/cases', { reporter_type: 'public', reporter_name: contact.name.value, reporter_email: contact.email.value, reporter_phone: contact.phone.value, category: contact.topic.value === 'support' ? 'technical' : 'general_support', subject: `Website enquiry: ${label}`.slice(0, 200), details: contact.message.value }).catch(() => ({ ok: false, data: {} }));
        busyBtn(contact, false);
        if (r.ok) { setStatus(contact, `Sent. Your reference is ${r.data.case?.reference_code || 'on its way by email'}. We will reply by email.`, 'good'); contact.reset(); }
        else setStatus(contact, r.data.error || 'That did not send. Please try again.', 'bad');
      });
    }
  });
})();
