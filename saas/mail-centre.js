/* Shared mail UI in both portals; textContent protects messages from HTML/script injection. */
(() => {
  const el = (t, c, text) => {
    const e = document.createElement(t);
    if (c) e.className = c;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  class MailCentre {
    constructor(host, { api, base = "/api/saas/mail", can = () => true }) {
      Object.assign(this, { host, api, base, can });
      this.folder = "all";
      this.query = "";
      this.sequence = 0;
    }
    button(label, fn, primary = false) {
      const b = el(
        "button",
        "portal-button" + (primary ? " primary" : ""),
        label,
      );
      b.type = "button";
      b.onclick = async () => {
        b.disabled = true;
        try {
          await fn();
        } catch (e) {
          this.notice.textContent = e.message;
        } finally {
          b.disabled = false;
        }
      };
      return b;
    }
    async render() {
      const seq = ++this.sequence;
      this.host.replaceChildren();
      const toolbar = el("div", "portal-toolbar");
      this.notice = el("p", "portal-note");
      this.notice.setAttribute("role", "status");
      const select = el("select", "portal-search");
      for (const [value, label] of [
        ["all", "All mail"],
        ["received", "Received"],
        ["drafts", "Drafts & approved"],
        ["sent", "Sent"],
        ["scheduled", "Scheduled"],
        ["marketing", "Marketing"],
        ["campaign", "Campaigns"],
        ["enquiry", "Enquiries"],
        ["invoice", "Invoices"],
        ["support", "Support"],
      ]) {
        const o = el("option", "", label);
        o.value = value;
        o.selected = value === this.folder;
        select.append(o);
      }
      select.setAttribute("aria-label", "Email folder");
      select.hidden = true;
      const folders = el('div', 'context-section-tabs'); folders.setAttribute('role', 'tablist'); folders.setAttribute('aria-label', 'Email folders');
      for (const option of select.options) {
        const b = this.button(option.textContent, () => { this.folder = option.value; this.refocusFolder = true; return this.render(); });
        b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(option.value === this.folder)); b.dataset.sectionKey = option.value; folders.append(b);
      }
      this.host.append(folders);
      // The folder tabs are rebuilt on every change: keep keyboard focus on the selected folder instead of losing it.
      if (this.refocusFolder) { this.refocusFolder = false; folders.querySelector('[aria-selected=true]')?.focus(); }
      select.onchange = () => {
        this.folder = select.value;
        this.render();
      };
      const search = el("input", "portal-search");
      search.type = "search";
      search.placeholder = "Search recipient or subject";
      search.value = this.query;
      search.setAttribute("aria-label", "Search emails");
      search.onkeydown = (e) => {
        if (e.key === "Enter") {
          this.query = search.value;
          this.render();
        }
      };
      toolbar.append(
        select,
        search,
        this.button("Refresh", () => this.render()),
      );
      if (this.can("create"))
        toolbar.append(this.button("Compose", () => this.compose(), true));
      this.host.append(toolbar, this.notice);
      const d = await this.api(
        this.base +
          "?folder=" +
          encodeURIComponent(this.folder) +
          "&q=" +
          encodeURIComponent(this.query),
      );
      if (seq !== this.sequence) return;
      this.notice.textContent =
        (d.provider_ready
          ? "Email provider configured. "
          : "Email provider setup required before sending. ") + d.receipts_note;
      const list = el("div", "portal-mail-list");
      for (const m of d.messages) {
        const b = this.button("", () => this.detail(m));
        b.className = "portal-panel portal-mail-row";
        const text = el("span");
        text.append(
          el("b", "", m.subject),
          el(
            "small",
            "",
            m.recipient +
              " · " +
              m.category +
              " · " +
              new Date(m.created_at).toLocaleString(),
          ),
        );
        b.append(text, el("span", "portal-status", m.status));
        list.append(b);
      }
      for (const m of d.received || []) {
        const b = this.button("", () => {
          const dialog = this.modal(m.subject || "Received email");
          dialog.append(
            el("p", "", m.recipient),
            el("pre", "portal-record-text", m.body),
            el(
              "p",
              "portal-note",
              "Received via the business’s verified email channel.",
            ),
          );
        });
        b.className = "portal-panel portal-mail-row";
        b.append(
          el("b", "", m.subject || "Received email"),
          el("small", "", m.recipient),
          el("span", "portal-status", "received"),
        );
        list.append(b);
      }
      if (!d.messages.length && !d.received?.length)
        list.append(el("p", "portal-empty", "No emails in this folder."));
      this.host.append(list);
    }
    modal(title) {
      const d = el("dialog", "portal-modal");
      const h = el("div", "portal-toolbar");
      h.append(
        el("h2", "", title),
        this.button("Close", () => d.close()),
      );
      d.append(h);
      document.body.append(d);
      d.addEventListener("close", () => d.remove(), { once: true });
      d.showModal();
      return d;
    }
    compose(m = null) {
      const d = this.modal(m ? "Edit draft" : "Compose email"),
        f = el("form", "portal-form");
      const add = (label, name, type = "input") => {
        const l = el("label", "", label),
          i = el(type);
        i.name = name;
        if (type === "textarea") i.rows = 6;
        i.value = m?.[name] || "";
        l.append(i);
        f.append(l);
        return i;
      };
      add("To", "recipient").type = "email";
      add("Subject", "subject");
      const category = add("Category", "category", "select");
      for (const v of [
        "general",
        "support",
        "enquiry",
        "invoice",
        "marketing",
        "campaign",
      ]) {
        const o = el("option", "", v);
        o.value = v;
        category.append(o);
      }
      category.value = m?.category || "general";
      const body = add("Message", "body", "textarea"),
        schedule = add("Schedule (optional, your local time)", "scheduled_at");
      schedule.type = "datetime-local";
      if (m?.scheduled_at) {
        const date = new Date(m.scheduled_at);
        schedule.value = new Date(date - date.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);
      }
      f.append(
        this.button(
          "Draft with AI",
          async () => {
            const brief = prompt(
              "Describe the facts and purpose for this draft. Do not include secrets.",
            );
            if (!brief) return;
            const r = await this.api(this.base + "/ai/draft", {
              method: "POST",
              body: JSON.stringify({ brief, category: category.value }),
            });
            body.value = r.draft || "";
          },
          false,
        ),
      );
      const error = el("p", "portal-note");
      error.setAttribute("role", "status");
      f.append(error);
      const save = el(
        "button",
        "portal-button primary",
        "Save draft for review",
      );
      f.append(save);
      f.onsubmit = async (e) => {
        e.preventDefault();
        save.disabled = true;
        try {
          const v = Object.fromEntries(new FormData(f));
          v.scheduled_at = v.scheduled_at
            ? new Date(v.scheduled_at).toISOString()
            : null;
          if (m) v.revision = m.revision;
          await this.api(this.base + (m ? "/" + m.id : ""), {
            method: m ? "PUT" : "POST",
            body: JSON.stringify(v),
          });
          d.close();
          await this.render();
        } catch (e) {
          error.textContent = e.message;
        } finally {
          save.disabled = false;
        }
      };
      d.append(f);
    }
    async detail(m) {
      const data = await this.api(this.base + "/" + m.id);
      m = data.message;
      const d = this.modal(m.subject);
      d.append(
        el("p", "", m.recipient + " · " + m.category + " · " + m.status),
        el("pre", "portal-record-text", m.body),
      );
      const actions = el("div", "portal-toolbar"),
        error = el("p", "portal-note");
      error.setAttribute("role", "status");
      const action = (label, suffix, permission) => {
        if (this.can(permission))
          actions.append(
            this.button(
              label,
              async () => {
                try {
                  await this.api(this.base + "/" + m.id + "/" + suffix, {
                    method: "POST",
                    body: JSON.stringify({ revision: m.revision }),
                  });
                  d.close();
                  await this.render();
                } catch (e) {
                  error.textContent = e.message;
                }
              },
              suffix === "send",
            ),
          );
      };
      if (
        ["draft", "approved", "scheduled"].includes(m.status) &&
        this.can("edit")
      )
        actions.append(
          this.button("Edit (resets approval)", () => {
            d.close();
            this.compose(m);
          }),
        );
      if (m.status === "draft")
        action("Approve reviewed version", "approve", "approve");
      if (m.status === "approved")
        action(
          m.scheduled_at ? "Schedule approved email" : "Send approved email",
          "send",
          "send",
        );
      if (["draft", "approved", "scheduled"].includes(m.status))
        action("Cancel", "cancel", "edit");
      d.append(actions, error, el("h3", "", "Activity"));
      for (const e of data.events)
        d.append(
          el(
            "p",
            "portal-note",
            e.action +
              " · " +
              e.actor +
              " · " +
              new Date(e.created_at).toLocaleString(),
          ),
        );
    }
  }
  window.SuperProMailCentre = MailCentre;
  let business;
  const init = () => {
    if (!document.querySelector("#workspace")) return;
    let view = document.querySelector("#mail-view");
    if (!view) {
      view = el("section", "view");
      view.id = "mail-view";
      view.hidden = true;
      view.append(el("h1", "", "Email Centre"));
      document.querySelector(".content-wrap").append(view);
    }
    const host = el("div");
    view.append(host);
    business = new MailCentre(host, {
      api: async (url, opt = {}) => {
        const r = await fetch(url, {
            credentials: "same-origin",
            ...opt,
            headers: {
              "Content-Type": "application/json",
              ...(window.SuperProWorkspaceContext?.headers?.() || {}),
            },
          }),
          d = await r.json();
        if (!r.ok) throw Error(d.error || "Email action failed");
        return d;
      },
      can: (a) => window.SuperProCan?.("mail", a) === true,
    });
  };
  init();
  window.addEventListener("gds:viewchange", (e) => {
    if (e.detail.view === "mail")
      business?.render().catch((e) => {
        business.notice.textContent = e.message;
      });
  });
})();
