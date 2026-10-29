(() => {
  const f = document.querySelector("#platform-staff-login");
  if (!f) return;
  f.onsubmit = async (e) => {
    e.preventDefault();
    const msg = document.querySelector("#platform-staff-message"),
      b = f.querySelector("button");
    b.disabled = true;
    try {
      const r = await fetch("/api/operator/staff/login", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(Object.fromEntries(new FormData(f))),
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error || "Sign-in failed");
      sessionStorage.removeItem("fp-admin-key");
      location.replace("/office/");
    } catch (e) {
      msg.textContent = e.message;
    } finally {
      b.disabled = false;
    }
  };
})();
