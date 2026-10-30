(() => {
  const $ = (s) => document.querySelector(s),
    el = (t, c, text) => {
      const e = document.createElement(t);
      if (c) e.className = c;
      if (text !== undefined) e.textContent = text;
      return e;
    };
  const api = async (path, opt = {}) => {
    const r = await fetch(path, {
      credentials: "same-origin",
      ...opt,
      headers: {
        "Content-Type": "application/json",
        ...(window.SuperProWorkspaceContext?.headers?.() || {}),
        ...opt.headers,
      },
    });
    const d = await r.json();
    if (!r.ok) throw Error(d.error || "Action unavailable");
    return d;
  };
  // Enquiries, Quotes, Bookings and Invoices moved to the connected pipeline (workspace-pipeline.js, Phase 04).
  const types = {
    businesscampaigns: ["Campaigns", "campaign"],
  };
  const services = {
    phone: [
      "Phone Numbers",
      "Request a new business number, forwarding or a provider-supported port. Ownership checks and price approval come before activation.",
    ],
    calls: [
      "Calls & SMS",
      "Dedicated business calling and SMS require verified numbers, consent, routing tests and usage caps.",
    ],
    meetings: [
      "Video Meetings",
      "Provider scheduling and secure meeting rooms require a configured video integration.",
    ],
    website: [
      "Website & Domain",
      "Connect a site you own or request an AI-assisted draft. Domain costs, ownership, DNS and publish approval are checked first.",
    ],
    searchconsole: [
      "Search Console",
      "Connect a verified Google or Bing property. Indexing and performance will show evidence from the provider.",
    ],
    backlinks: [
      "Backlink Suggestions",
      "Request relevant listings and outreach drafts. Approve every outreach; no ranking guarantees or link schemes.",
    ],
    receptionist: [
      "AI Receptionist",
      "Save an isolated business draft. Live calls require provider routing, agreed pricing, spend caps and a successful test.",
    ],
  };
  const msg = (host, text, bad = false) => {
    const p = host.querySelector("[role=status]");
    if (p) {
      p.textContent = text;
      p.style.color = bad ? "var(--red)" : "var(--green)";
    }
  };
  function view(id, title, description) {
    let s = $("#" + id + "-view");
    if (s) return s;
    s = el("section", "view");
    s.id = id + "-view";
    s.hidden = true;
    const head = el("div", "page-heading"),
      wrap = el("div");
    wrap.append(el("h1", "", title), el("p", "", description));
    head.append(wrap);
    s.append(head, el("p", "portal-note"));
    s.lastChild.setAttribute("role", "status");
    $(".content-wrap").append(s);
    return s;
  }
  function button(text, fn) {
    const b = el("button", "portal-button", text);
    b.type = "button";
    b.onclick = async () => {
      b.disabled = true;
      try {
        await fn();
      } catch (e) {
        const s = b.closest("section");
        if (s) msg(s, e.message, true);
      } finally {
        b.disabled = false;
      }
    };
    return b;
  }
  function input(form, label, name, type = "text") {
    const l = el("label", "", label),
      i = el("input");
    i.name = name;
    i.type = type;
    l.append(i);
    form.append(l);
    return i;
  }
  function init() {
    for (const [id, [title]] of Object.entries(types))
      view(
        id,
        title,
        "Private records for this business. Draft, review and approve before the next action.",
      );
    for (const [id, [title, copy]] of Object.entries(services))
      view(id, title, copy);
    view(
      "archive",
      "Records & Archive",
      "Business records only; existing exports, jobs and finance remain available in their respective sections.",
    );
    view(
      "teamchat",
      "Team Chat",
      "Your organisation’s staff discussion and current availability.",
    );
    view(
      "supportaccess",
      "Support Access",
      "Review who is requesting temporary read-only help with this business.",
    );
  }
  async function load(id) {
    const s = $("#" + id + "-view");
    if (!s) return;
    s.querySelector("[data-body]")?.remove();
    const host = el("div", "portal-view");
    host.dataset.body = "1";
    s.append(host);
    const generation = window.GDS_SESSION?.organisation?.id;
    if (types[id]) {
      const [title, kind] = types[id],
        d = await api("/api/saas/business-hub/" + kind);
      if (window.GDS_SESSION?.organisation?.id !== generation) return;
      const form = el("form", "portal-panel portal-form");
      form.append(el("h2", "", "Create " + kind + " draft"));
      input(form, "Title", "title").required = true;
      input(form, "Details", "body");
      if (["quote", "invoice"].includes(kind)) {
        const a = input(
          form,
          "Amount (AUD, excluding GST)",
          "amount",
          "number",
        );
        a.min = "0";
        a.step = ".01";
      }
      const submit = el("button", "portal-button primary", "Save draft");
      form.append(submit);
      form.onsubmit = async (e) => {
        e.preventDefault();
        submit.disabled = true;
        try {
          const values = Object.fromEntries(new FormData(form));
          await api("/api/saas/business-hub/" + kind, {
            method: "POST",
            body: JSON.stringify({
              title: values.title,
              body: values.body || "",
              amount_cents: Math.round(Number(values.amount || 0) * 100),
            }),
          });
          await load(id);
        } catch (e) {
          msg(s, e.message, true);
        } finally {
          submit.disabled = false;
        }
      };
      host.append(form);
      const grid = el("div", "portal-grid");
      for (const r of d.records) {
        const card = el("article", "portal-card");
        card.append(
          el("h2", "", r.title),
          el("span", "portal-status", r.status),
          el("p", "", r.body),
        );
        if (r.amount_cents)
          card.append(
            el(
              "b",
              "",
              (r.amount_cents / 100).toLocaleString("en-AU", {
                style: "currency",
                currency: "AUD",
              }),
            ),
          );
        if (r.status === "draft")
          card.append(
            button("Approve reviewed draft", async () => {
              await api(`/api/saas/business-hub/${kind}/${r.id}/approve`, {
                method: "POST",
                body: JSON.stringify({ revision: r.revision }),
              });
              await load(id);
            }),
          );
        if (kind === "quote" && r.status === "approved")
          card.append(
            button("Record customer acceptance", async () => {
              const evidence = prompt(
                "Record the customer acceptance evidence (date, channel and reference).",
              );
              if (!evidence) return;
              await api(`/api/saas/business-hub/quote/${r.id}/accept`, {
                method: "POST",
                body: JSON.stringify({ revision: r.revision, evidence }),
              });
              await load(id);
            }),
          );
        if (kind === "quote" && r.status === "accepted")
          card.append(
            button("Create booking", async () => {
              const date = prompt(
                "Booking date and time, including timezone (example: 2026-11-02T09:00:00+08:00)",
              );
              if (!date) return;
              await api(`/api/saas/business-hub/quote/${r.id}/book`, {
                method: "POST",
                body: JSON.stringify({
                  revision: r.revision,
                  start_at: new Date(date).toISOString(),
                }),
              });
              await load(id);
            }),
          );
        if (["invoice", "campaign"].includes(kind))
          card.append(
            el(
              "p",
              "portal-note",
              "Delivery uses the Email Centre with separate approval. Bulk campaigns require verified audience opt-outs.",
            ),
          );
        grid.append(card);
      }
      host.append(grid);
      if (!d.records.length)
        grid.append(
          el("p", "portal-empty", "No " + title.toLowerCase() + " yet."),
        );
    } else if (services[id]) {
      const d = await api("/api/saas/service-requests/" + id);
      if (window.GDS_SESSION?.organisation?.id !== generation) return;
      const panel = el("article", "portal-panel");
      panel.append(
        el("span", "portal-status", "Provider setup required"),
        el(
          "p",
          "",
          "Requests are saved privately. No number purchase, port, website publishing or paid service activation takes place here.",
        ),
      );
      const form = el("form", "portal-form");
      input(form, "Requirements", "brief").required = true;
      const b = el("button", "portal-button primary", "Save service request");
      form.append(b);
      form.onsubmit = async (e) => {
        e.preventDefault();
        b.disabled = true;
        try {
          await api("/api/saas/service-requests/" + id, {
            method: "POST",
            body: JSON.stringify(Object.fromEntries(new FormData(form))),
          });
          await load(id);
        } catch (e) {
          msg(s, e.message, true);
        } finally {
          b.disabled = false;
        }
      };
      panel.append(form);
      host.append(panel);
      for (const r of d.requests) {
        const c = el("article", "portal-card");
        c.append(
          el("span", "portal-status", r.status),
          el("p", "", r.brief),
          el("small", "", new Date(r.created_at).toLocaleString()),
        );
        host.append(c);
      }
      if (id === "receptionist" && window.GDS_SESSION?.user?.role === "owner") {
        const d = await api("/api/saas/receptionist-profile"),
          p = d.profile || {},
          f = el("form", "portal-panel portal-form");
        f.append(el("h2", "", "Business receptionist draft"));
        for (const [name, label, def] of [
          ["greeting", "Greeting", "Thank you for calling. How may we help?"],
          ["knowledge", "Verified services and business facts", ""],
          ["hours", "Hours and fallback", ""],
          ["timezone", "Timezone", "Australia/Perth"],
        ])
          input(f, label, name).value = p[name] || def;
        const b = el("button", "portal-button primary", "Save isolated draft");
        f.append(b);
        f.onsubmit = async (e) => {
          e.preventDefault();
          try {
            await api("/api/saas/receptionist-profile", {
              method: "PUT",
              body: JSON.stringify({
                ...Object.fromEntries(new FormData(f)),
                revision: p.revision || 0,
              }),
            });
            msg(s, "Draft saved. This has not activated live call handling.");
            await load(id);
          } catch (e) {
            msg(s, e.message, true);
          }
        };
        host.append(f);
      }
    } else if (id === "teamchat") {
      host.append(
        button("Open office staff chat", () => {
          const b = document.querySelector(
            "[data-staff-chat-open],#staff-chat-toggle,.sc-launch",
          );
          if (b) b.click();
          else window.dispatchEvent(new Event("superpro:staff-chat-open"));
        }),
      );
    } else if (id === "archive") {
      const d = await api("/api/saas/business-archive");
      for (const r of d.records) {
        const c = el("article", "portal-card");
        c.append(el("h2", "", r.title), el("p", "", r.kind + " · " + r.status));
        host.append(c);
      }
      if (!d.records.length)
        host.append(
          el(
            "p",
            "portal-empty",
            "No new business documents yet. Existing jobs and financial records stay in their original business sections.",
          ),
        );
    } else if (id === "supportaccess") {
      const d = await api("/api/saas/support-access");
      for (const r of d.requests) {
        const c = el("article", "portal-card");
        c.append(
          el("h2", "", r.purpose),
          el(
            "p",
            "",
            JSON.parse(r.scope_json).join(", ") + " · " + r.hours + " hours",
          ),
          el("span", "portal-status", r.status),
        );
        for (const decision of r.status === "pending"
          ? ["approved", "refused"]
          : r.status === "approved"
            ? ["revoked"]
            : [])
          c.append(
            button(decision, async () => {
              await api("/api/saas/support-access/" + r.id + "/decision", {
                method: "POST",
                body: JSON.stringify({ decision }),
              });
              await load(id);
            }),
          );
        host.append(c);
      }
      if (!d.requests.length)
        host.append(
          el(
            "p",
            "portal-empty",
            "No support access requests. No platform staff member has been granted access here.",
          ),
        );
    }
  }
  init();
  window.addEventListener("gds:viewchange", (e) => {
    if (
      types[e.detail.view] ||
      services[e.detail.view] ||
      ["archive", "teamchat", "supportaccess"].includes(e.detail.view)
    )
      load(e.detail.view).catch((err) =>
        msg($("#" + e.detail.view + "-view"), err.message, true),
      );
  });
})();
