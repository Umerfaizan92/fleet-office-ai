(() => {
  const $ = (s) => document.querySelector(s),
    el = (t, c, txt) => {
      const e = document.createElement(t);
      if (c) e.className = c;
      if (txt) e.textContent = txt;
      return e;
    };
  let rail,
    tabs,
    active = "dashboard";
  function rebuild() {
    const nav = window.SuperProNav,
      session = window.GDS_SESSION;
    if (!nav || !session) return;
    if (!rail) {
      document.body.classList.add("portal-workspace");
      rail = el("aside", "portal-rail");
      rail.setAttribute("aria-label", "Main sections");
      const brand = el("a", "portal-brand");
      brand.href = "#b01/home";
      brand.innerHTML =
        '<span class="portal-mark">SP</span><span>Super Pro AI</span>';
      rail.append(brand);
      const toggle = el("button", "portal-main-button");
      toggle.type = "button";
      toggle.innerHTML =
        '<span class="portal-icon">☰</span><span>Pin navigation</span>';
      toggle.setAttribute("aria-label", "Expand main navigation");
      toggle.onclick = () => {
        delete rail.dataset.collapsed;
        const open = rail.dataset.expanded !== "true";
        rail.dataset.expanded = String(open);
        toggle.setAttribute("aria-expanded", String(open));
      };
      rail.append(toggle);
      const context = $("#workspace-context");
      if (context) rail.append(context);
      rail.append(el("nav"));
      rail.addEventListener("pointerleave", () => {
        delete rail.dataset.collapsed;
      });
      rail.addEventListener("click", (e) => {
        const b = e.target.closest("[data-domain]");
        if (b) {
          rail.dataset.collapsed = "true";
          rail.dataset.expanded = "false";
          if (e.detail) b.blur();
        }
      });
      $("#workspace").append(rail);
      tabs = el("nav", "portal-subtabs");
      tabs.setAttribute("aria-label", "Current section pages");
      $(".app-topbar").after(tabs);
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") rail.dataset.expanded = "false";
      });
    }
    const views = new Set(nav.sequence(session.user.role)),
      host = rail.querySelector("nav");
    host.replaceChildren();
    for (const d of nav.DOMAINS) {
      const items = d.items.filter((i) => views.has(i.view));
      if (!items.length) continue;
      const b = el("button", "portal-main-button");
      b.type = "button";
      b.dataset.domain = d.id;
      b.dataset.jump = items[0].view;
      b.setAttribute("aria-label", d.label);
      b.innerHTML = `<span class="portal-icon"><svg aria-hidden="true"><use href="#${d.icon}"></use></svg></span>`;
      b.append(el("span", "", d.label));
      host.append(b);
    }
    reveal(active);
  }
  function reveal(view) {
    active = view;
    if (!rail) return;
    const nav = window.SuperProNav,
      d = nav.DOMAINS.find((d) => d.items.some((i) => i.view === view));
    if (!d) return;
    const allowed = new Set(nav.sequence(window.GDS_SESSION.user.role));
    rail.querySelectorAll("[data-domain]").forEach((b) => {
      if (b.dataset.domain === d.id) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    tabs.replaceChildren();
    for (const i of d.items.filter((i) => allowed.has(i.view))) {
      const b = el("button", "", i.label);
      b.type = "button";
      b.dataset.jump = i.view;
      if (i.view === view) b.setAttribute("aria-current", "page");
      tabs.append(b);
    }
    if (matchMedia("(hover:none)").matches) rail.dataset.expanded = "false";
  }
  fetch("/api/public/preview-status")
    .then((r) => r.json())
    .then((d) => {
      if (d.isolated_preview) {
        document.body.dataset.isolatedPreview = "true";
        const note = el(
          "div",
          "portal-preview-banner",
          "Isolated preview · Synthetic test data only · Data may reset on restart.",
        );
        document.body.prepend(note);
      }
    })
    .catch(() => {});
  window.addEventListener("superpro:nav-ready", rebuild);
  window.addEventListener("superpro:access-changed", rebuild);
  window.addEventListener("gds:viewchange", (e) => reveal(e.detail.view));
})();
