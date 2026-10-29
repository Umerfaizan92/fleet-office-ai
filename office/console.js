(() => {
  const $ = (s) => document.querySelector(s),
    el = (t, c, text) => {
      const e = document.createElement(t);
      if (c) e.className = c;
      if (text !== undefined) e.textContent = text;
      return e;
    };
  const definitions = [
    [
      "f01",
      "overview",
      "Platform overview",
      "grid",
      [["overview", "Overview"]],
    ],
    [
      "f02",
      "subscribers",
      "Subscribers",
      "users",
      [["subscribers", "Businesses"]],
    ],
    [
      "f03",
      "billing",
      "Billing & usage",
      "card",
      [
        ["invoices", "Subscription invoices"],
        ["legacy:subpay", "Payment providers"],
        ["legacy:subscribers", "Plans & add-ons"],
      ],
    ],
    [
      "f04",
      "support",
      "Support & success",
      "mail",
      [
        ["mail", "Email Centre"],
        ["records:ticket", "Tickets"],
        ["support-access", "Support access"],
      ],
    ],
    [
      "f05",
      "team",
      "Super Pro team",
      "users",
      [
        ["records:staff_task", "Team work"],
        ["records:hire", "Hiring requests"],
      ],
    ],
    [
      "f06",
      "marketing",
      "Super Pro marketing",
      "spark",
      [
        ["records:prospect", "Prospect CRM"],
        ["records:campaign", "Campaign drafts"],
        ["records:content", "Content drafts"],
        ["records:announcement_draft", "Announcement drafts"],
        ["legacy:searchvisibility", "Website visibility"],
      ],
    ],
    [
      "f07",
      "operations",
      "Operations & maintenance",
      "gear",
      [
        ["records:task", "Tasks & releases"],
        ["records:incident", "Incidents"],
        ["records:cost", "Operating costs"],
        ["legacy:connections", "Provider readiness"],
      ],
    ],
    [
      "f08",
      "security",
      "Security & audit",
      "shield",
      [["audit", "Activity log"]],
    ],
    [
      "f09",
      "founder",
      "Founder controls",
      "key",
      [
        ["complimentary", "Complimentary grants"],
        ["staff", "Operator staff & roles"],
        ["legacy-inventory", "Legacy inventory"],
      ],
    ],
  ];
  const paths = {
    grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
    users:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-4",
    card: "M3 5h18v14H3zM3 9h18M6 15h3",
    mail: "M3 5h18v14H3zM3 5l9 8 9-8",
    spark: "m12 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3Z",
    gear: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2",
    shield: "M12 2 3 6v6c0 6 9 10 9 10s9-4 9-10V6ZM8 12l3 3 5-6",
    key: "M14 4a6 6 0 1 0 6 6 6 6 0 0 0-6-6M9 14l-7 7M4 19l2 2",
  };
  let me,
    current,
    tab,
    sequence = 0;
  const key = () => sessionStorage.getItem("fp-admin-key") || "";
  const api = async (url, opt = {}) => {
    const r = await fetch(url, {
        credentials: "same-origin",
        ...opt,
        headers: {
          "Content-Type": "application/json",
          ...(key() ? { "x-admin-key": key() } : {}),
          ...opt.headers,
        },
      }),
      d = await r.json();
    if (!r.ok) {
      if (r.status === 401) location.replace("/saas/operator-sign-in.html");
      throw Error(d.error || "Action unavailable");
    }
    return d;
  };
  const can = (section, action = "read") =>
    me?.role === "founder" || me?.grants?.includes(section + "." + action);
  const notify = (t) => ($("#console-notice").textContent = t);
  const button = (text, fn, primary = false) => {
    const b = el("button", "portal-button" + (primary ? " primary" : ""), text);
    b.type = "button";
    b.onclick = async () => {
      b.disabled = true;
      try {
        await fn();
      } catch (e) {
        notify(e.message);
      } finally {
        b.disabled = false;
      }
    };
    return b;
  };
  function panel(title, copy) {
    const c = el("article", "portal-panel");
    c.append(el("h2", "", title));
    if (copy) c.append(el("p", "", copy));
    return c;
  }
  function field(f, label, name, type = "text") {
    const l = el("label", "", label),
      i = el("input");
    i.name = name;
    i.type = type;
    l.append(i);
    f.append(l);
    return i;
  }
  function jsonCard(value, title) {
    const c = panel(title);
    c.append(el("pre", "portal-record-text", JSON.stringify(value, null, 2)));
    return c;
  }
  function navigate(section, which) {
    location.hash = section[0] + "/" + (which || section[4][0][0]);
  }
  async function show() {
    const seq = ++sequence,
      hash = decodeURIComponent(location.hash.slice(1)).split("/"),
      visible = definitions.filter((d) => can(d[1]));
    current = visible.find((d) => d[0] === hash[0]) || visible[0];
    if (!current) {
      notify("No platform sections have been granted.");
      return;
    }
    tab =
      current[4].find((t) => t[0] === hash.slice(1).join("/")) || current[4][0];
    $("#console-title").textContent = current[2];
    $("#console-tabs").replaceChildren(
      ...current[4].map((t) => {
        const b = button(t[1], () => navigate(current, t[0]));
        if (t === tab) b.setAttribute("aria-current", "page");
        return b;
      }),
    );
    $("#console-nav")
      .querySelectorAll("[data-section]")
      .forEach((b) => {
        if (b.dataset.section === current[0])
          b.setAttribute("aria-current", "page");
        else b.removeAttribute("aria-current");
      });
    const host = $("#console-content");
    host.replaceChildren(el("p", "portal-note", "Loading…"));
    notify("");
    try {
      const route = tab[0];
      let d;
      if (route === "mail") {
        host.replaceChildren();
        const mail = new window.SuperProMailCentre(host, {
          api,
          base: "/api/operator/mail",
          can: (a) => can("support", a),
        });
        await mail.render();
        return;
      }
      if (route.startsWith("legacy:")) {
        host.replaceChildren(
          panel(
            tab[1],
            "Existing founder tools are retained while their separate platform replacement is reconciled. Only the founder can open this maintenance view. Subscriber business records are not migrated or reassigned.",
          ),
        );
        if (me.role === "founder") {
          const a = el("a", "portal-button", "Open existing " + tab[1]);
          a.href =
            "/office/legacy.html?view=" + encodeURIComponent(route.slice(7));
          host.append(a);
        }
        return;
      }
      d = await api("/api/operator/" + route.replace("records:", "records/"));
      if (seq !== sequence) return;
      host.replaceChildren();
      if (route === "overview") {
        const grid = el("div", "portal-grid");
        for (const r of d.counts)
          grid.append(panel(r.status, String(r.count) + " subscribers"));
        grid.append(
          panel(
            "Complimentary",
            String(d.complimentary) + " valid software waivers",
          ),
        );
        host.append(
          grid,
          jsonCard(d.provider_readiness, "Provider readiness"),
          panel(
            "Operations boundaries",
            "Business customer, job, finance and staff records are excluded. Support access requires the subscriber owner’s recorded approval.",
          ),
        );
      } else if (route === "subscribers") {
        const grid = el("div", "portal-grid");
        for (const o of d.subscribers) {
          const c = panel(
            o.business,
            o.plan_id + " · " + (o.complimentary ? "Complimentary" : o.status),
          );
          c.append(
            el("small", "", o.id),
            button("Account details", async () => {
              const p = await api("/api/operator/subscribers/" + o.id);
              const dlg = el("dialog", "portal-modal");
              dlg.append(
                jsonCard(p, "Subscriber account summary"),
                button("Close", () => dlg.close()),
              );
              document.body.append(dlg);
              dlg.onclose = () => dlg.remove();
              dlg.showModal();
            }),
          );
          grid.append(c);
        }
        host.append(grid);
        if (!d.subscribers.length)
          host.append(
            panel(
              "No subscribers yet",
              "Verified businesses will appear here.",
            ),
          );
      } else if (route === "invoices") {
        for (const i of d.invoices)
          host.append(
            panel(
              i.number,
              `${(i.total_cents / 100).toLocaleString("en-AU", { style: "currency", currency: "AUD" })} · ${i.status} · due ${i.due_at}`,
            ),
          );
        if (!d.invoices.length)
          host.append(
            panel(
              "No subscription invoices",
              "Software waivers prevent new subscription invoices. Business customer invoices stay in the Business Workspace.",
            ),
          );
      } else if (route.startsWith("records:")) {
        const kind = route.slice(8);
        if (can(current[1], "create")) {
          const f = el("form", "portal-panel portal-form");
          f.append(el("h2", "", "New " + tab[1].toLowerCase()));
          field(f, "Title", "title").required = true;
          field(f, "Details", "body");
          f.append(el("button", "portal-button primary", "Save record"));
          f.onsubmit = async (e) => {
            e.preventDefault();
            try {
              await api("/api/operator/records/" + kind, {
                method: "POST",
                body: JSON.stringify(Object.fromEntries(new FormData(f))),
              });
              await show();
            } catch (e) {
              notify(e.message);
            }
          };
          host.append(f);
        }
        for (const r of d.records)
          host.append(panel(r.title, r.body + " · " + r.status));
        if (!d.records.length)
          host.append(
            panel(
              "No records yet",
              "Saved here only for Super Pro operations.",
            ),
          );
      } else if (route === "audit") {
        for (const e of d.events)
          host.append(
            panel(e.action, e.actor + " · " + e.section + " · " + e.created_at),
          );
      } else if (route === "legacy-inventory") {
        host.append(
          panel(
            "Read-only legacy inventory",
            "No record content is shown here and no data migration or deletion has occurred.",
          ),
        );
        for (const r of d.inventory)
          host.append(panel(r.table, String(r.count) + " records retained"));
      } else if (route === "complimentary") {
        const f = el("form", "portal-panel portal-form");
        f.append(el("h2", "", "Grant a software waiver"));
        const subscriberLabel = el("label", "", "Subscriber business"),
          subscriberSelect = el("select");
        subscriberSelect.name = "organisation_id";
        subscriberSelect.required = true;
        const subscribers = await api("/api/operator/subscribers");
        for (const o of subscribers.subscribers) {
          const option = el("option", "", o.business);
          option.value = o.id;
          subscriberSelect.append(option);
        }
        subscriberLabel.append(subscriberSelect);
        f.append(subscriberLabel);
        field(
          f,
          "Feature profile (starter / operations / scale)",
          "feature_profile",
        ).value = "scale";
        field(f, "Reason", "reason").required = true;
        const rev = field(
          f,
          "Current grant revision (0 for a new grant)",
          "revision",
          "number",
        );
        rev.min = "0";
        rev.value = "0";
        field(f, "Optional end date", "ends_at", "datetime-local");
        f.append(
          el("p", "portal-note", d.provider_subsidies),
          el("button", "portal-button primary", "Grant Complimentary"),
        );
        f.onsubmit = async (e) => {
          e.preventDefault();
          const v = Object.fromEntries(new FormData(f)),
            id = v.organisation_id;
          delete v.organisation_id;
          v.revision = Number(v.revision);
          v.ends_at = v.ends_at ? new Date(v.ends_at).toISOString() : null;
          try {
            await api("/api/operator/complimentary/" + encodeURIComponent(id), {
              method: "PUT",
              body: JSON.stringify(v),
            });
            await show();
          } catch (e) {
            notify(e.message);
          }
        };
        host.append(f);
        for (const g of d.grants) {
          const c = panel(
            g.organisation_id,
            g.feature_profile +
              " · revision " +
              g.revision +
              " · " +
              (g.revoked_at ? "revoked" : g.ends_at || "No expiry"),
          );
          c.append(el("p", "", g.reason));
          if (!g.revoked_at)
            c.append(
              button("Revoke waiver", async () => {
                if (
                  !confirm(
                    "Revoke this organisation’s software waiver? Its normal subscription rules will apply.",
                  )
                )
                  return;
                await api(
                  "/api/operator/complimentary/" +
                    g.organisation_id +
                    "/revoke",
                  {
                    method: "POST",
                    body: JSON.stringify({ revision: g.revision }),
                  },
                );
                await show();
              }),
            );
          host.append(c);
        }
      } else if (route === "staff") {
        const f = el("form", "portal-panel portal-form");
        f.append(el("h2", "", "Create an individual platform identity"));
        field(f, "Name", "name").required = true;
        field(f, "Email", "email", "email").required = true;
        field(
          f,
          "Initial password (14+ characters, transfer privately)",
          "password",
          "password",
        ).minLength = 14;
        const role = field(f, "Role", "role");
        role.value = "custom";
        const grants = field(
          f,
          "Grants separated by commas (for example support.read,support.create)",
          "grants",
        );
        grants.required = true;
        f.append(
          el("button", "portal-button primary", "Create staff identity"),
        );
        f.onsubmit = async (e) => {
          e.preventDefault();
          const v = Object.fromEntries(new FormData(f));
          v.grants = v.grants
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);
          try {
            const result = await api("/api/operator/staff", {
              method: "POST",
              body: JSON.stringify(v),
            });
            f.reset();
            const dialog = el("dialog", "portal-modal");
            dialog.append(
              panel("Authenticator setup — shown once", result.totp_secret),
              el("p", "", result.note),
              button("I have saved it securely", () => dialog.close()),
            );
            document.body.append(dialog);
            dialog.onclose = () => dialog.remove();
            dialog.showModal();
          } catch (e) {
            notify(e.message);
          }
        };
        host.append(
          f,
          jsonCard(
            { roles: d.roles, actions: d.actions },
            "Permission reference",
          ),
        );
        for (const u of d.users) {
          const c = panel(u.name, u.email + " · " + u.role + " · " + u.status);
          c.append(
            el("p", "", JSON.parse(u.grants_json).join(", ")),
            button("Edit individual access", async () => {
              const dialog = el("dialog", "portal-modal"),
                form = el("form", "portal-form"),
                selected = new Set(JSON.parse(u.grants_json));
              dialog.append(
                el("h2", "", u.name + " — platform access"),
                button("Close", () => dialog.close()),
              );
              for (const section of d.sections.filter((s) => s !== "founder")) {
                const group = el("fieldset", "portal-card");
                group.append(el("legend", "", section));
                for (const action of d.actions) {
                  const label = el("label", "", action),
                    box = el("input");
                  box.type = "checkbox";
                  box.name = "grant";
                  box.value = section + "." + action;
                  box.checked = selected.has(box.value);
                  label.prepend(box);
                  group.append(label);
                }
                form.append(group);
              }
              form.append(
                el(
                  "button",
                  "portal-button primary",
                  "Save access and end existing sessions",
                ),
              );
              form.onsubmit = async (e) => {
                e.preventDefault();
                try {
                  await api("/api/operator/staff/" + u.id, {
                    method: "PUT",
                    body: JSON.stringify({
                      revision: u.revision,
                      status: u.status,
                      grants: [...form.querySelectorAll("input:checked")].map(
                        (e) => e.value,
                      ),
                    }),
                  });
                  dialog.close();
                  await show();
                } catch (e) {
                  notify(e.message);
                }
              };
              dialog.append(form);
              document.body.append(dialog);
              dialog.onclose = () => dialog.remove();
              dialog.showModal();
            }),
            button(
              u.status === "active"
                ? "Suspend and end sessions"
                : "Restore staff",
              async () => {
                await api("/api/operator/staff/" + u.id, {
                  method: "PUT",
                  body: JSON.stringify({
                    revision: u.revision,
                    grants: JSON.parse(u.grants_json),
                    status: u.status === "active" ? "suspended" : "active",
                  }),
                });
                await show();
              },
            ),
          );
          host.append(c);
        }
      } else if (route === "support-access") {
        if (can("support", "create")) {
          const f = el("form", "portal-panel portal-form");
          field(f, "Organisation ID", "organisation_id").required = true;
          field(f, "Purpose (minimum 12 characters)", "purpose").required =
            true;
          field(f, "Hours (1–24)", "hours", "number").value = "1";
          field(f, "Areas: customers, jobs, communications", "areas").value =
            "customers";
          f.append(
            el(
              "button",
              "portal-button primary",
              "Request subscriber approval",
            ),
          );
          f.onsubmit = async (e) => {
            e.preventDefault();
            const v = Object.fromEntries(new FormData(f));
            v.hours = Number(v.hours);
            v.areas = v.areas.split(",").map((s) => s.trim());
            try {
              await api("/api/operator/support-access", {
                method: "POST",
                body: JSON.stringify(v),
              });
              await show();
            } catch (e) {
              notify(e.message);
            }
          };
          host.append(f);
        }
        for (const r of d.requests) {
          const c = panel(
            r.purpose,
            r.status +
              " · " +
              (r.expires_at || "Waiting for subscriber approval"),
          );
          if (r.status === "approved")
            for (const a of JSON.parse(r.scope_json))
              c.append(
                button("Read approved " + a, async () => {
                  const result = await api(
                    "/api/operator/support-access/" + r.id + "/records/" + a,
                  );
                  c.append(jsonCard(result.records, "Read-only support view"));
                }),
              );
          host.append(c);
        }
      }
    } catch (e) {
      if (seq === sequence) {
        host.replaceChildren(panel("Action unavailable", e.message));
        notify(e.message);
      }
    }
  }
  async function boot() {
    const preview = await api("/api/public/preview-status");
    if (preview.isolated_preview) {
      const banner = el(
        "div",
        "portal-preview-banner",
        "Isolated preview · Synthetic test data only · Data may reset on restart.",
      );
      document.body.prepend(banner);
    }
    const d = await api("/api/operator/me");
    me = d.user;
    $("#console-role").textContent = me.name + " · " + me.role;
    const nav = $("#console-nav");
    for (const def of definitions.filter((d) => can(d[1]))) {
      const b = button("", () => navigate(def));
      b.className = "portal-main-button";
      b.dataset.section = def[0];
      b.setAttribute("aria-label", def[2]);
      b.innerHTML = `<span class="portal-icon"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="${paths[def[3]]}"></path></svg></span>`;
      b.append(el("span", "", def[2]));
      nav.append(b);
    }
    $("#console-search").oninput = (e) => {
      const q = e.target.value.toLowerCase();
      nav
        .querySelectorAll("button")
        .forEach((b) => (b.hidden = !b.textContent.toLowerCase().includes(q)));
    };
    $("#console-logout").onclick = async () => {
      try {
        await api("/api/operator/logout", { method: "POST", body: "{}" });
      } finally {
        sessionStorage.removeItem("fp-admin-key");
        location.replace("/saas/operator-sign-in.html");
      }
    };
    $("#rail-toggle").onclick = () => {
      const rail = $("#console-rail");
      rail.dataset.expanded = String(rail.dataset.expanded !== "true");
    };
    $("#console-live").onclick = () => show();
    $("#console-update").onclick = () => {
      notify("Checking latest application files…");
      location.reload();
    };
    $("#console-notifications").onclick = async () => {
      try {
        const d = await api("/api/operator/notifications"),
          dialog = el("dialog", "portal-modal");
        dialog.append(
          el("h2", "", "Notifications"),
          button("Close", () => dialog.close()),
        );
        for (const e of d.events)
          dialog.append(
            panel(
              e.action,
              e.section +
                " · " +
                new Date(e.created_at).toLocaleString() +
                (e.read_at ? " · read" : ""),
            ),
          );
        if (!d.events.length)
          dialog.append(
            el("p", "", "No notifications for your authorised sections."),
          );
        document.body.append(dialog);
        dialog.onclose = () => dialog.remove();
        dialog.showModal();
        await api("/api/operator/notifications/read", {
          method: "POST",
          body: JSON.stringify({ ids: d.events.map((e) => e.id) }),
        });
      } catch (e) {
        notify(e.message);
      }
    };
    $("#console-theme").onclick = () => {
      const t =
        document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = t;
      localStorage.setItem("foai-theme", t);
    };
    document.documentElement.dataset.theme =
      localStorage.getItem("foai-theme") || "dark";
    window.addEventListener("hashchange", show);
    await show();
  }
  boot().catch((e) => notify(e.message));
})();
