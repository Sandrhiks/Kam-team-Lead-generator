// Email one-time-code sign-in: step 1 asks for the email, step 2 takes the 6-digit code.
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  let email = "", newAccount = false, timer = null;

  // Six single-digit boxes that behave like one field (typing, paste, backspace).
  const boxes = [];
  for (let i = 0; i < 6; i++) {
    const b = document.createElement("input");
    Object.assign(b, { inputMode: "numeric", maxLength: 1, autocomplete: i === 0 ? "one-time-code" : "off" });
    b.setAttribute("aria-label", `Digit ${i + 1}`);
    b.addEventListener("input", () => {
      const digits = b.value.replace(/\D/g, "");
      if (digits.length > 1) return fill(digits, i);
      b.value = digits;
      if (digits && i < 5) boxes[i + 1].focus();
      if (code().length === 6) $("fCode").requestSubmit();
    });
    b.addEventListener("keydown", e => {
      if (e.key === "Backspace" && !b.value && i > 0) boxes[i - 1].focus();
      if (e.key === "ArrowLeft" && i > 0) boxes[i - 1].focus();
      if (e.key === "ArrowRight" && i < 5) boxes[i + 1].focus();
    });
    b.addEventListener("paste", e => { e.preventDefault(); fill((e.clipboardData.getData("text") || "").replace(/\D/g, ""), 0); });
    boxes.push(b);
    $("code").appendChild(b);
  }
  function fill(digits, from) {
    digits.slice(0, 6 - from).split("").forEach((d, k) => { boxes[from + k].value = d; });
    boxes[Math.min(5, from + digits.length)].focus();
    if (code().length === 6) $("fCode").requestSubmit();
  }
  const code = () => boxes.map(b => b.value).join("");

  async function post(url, body) {
    const r = await fetch(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, ...j };
  }

  function cooldown(sec) {
    clearInterval(timer);
    const btn = $("resend");
    btn.disabled = true;
    let left = sec;
    const tick = () => {
      btn.textContent = left > 0 ? `Send a new code (${left}s)` : "Send a new code";
      if (left-- <= 0) { clearInterval(timer); btn.disabled = false; }
    };
    tick();
    timer = setInterval(tick, 1000);
  }

  async function requestCode(btn) {
    $("eErr").textContent = $("cErr").textContent = $("cOk").textContent = "";
    btn.disabled = true;
    const r = await post("/auth/otp/request", { email }).catch(() => ({ ok: false, error: "Couldn't reach the server. Check your connection." }));
    btn.disabled = false;
    if (!r.ok) return r.error || "Something went wrong.";
    newAccount = !!r.newAccount;
    $("mins").textContent = r.minutes || 10;
    $("devNote").classList.toggle("hidden", !r.devLog);
    $("newName").hidden = !newAccount;
    cooldown(30);
    return null;
  }

  $("fEmail").addEventListener("submit", async e => {
    e.preventDefault();
    email = $("email").value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $("eErr").textContent = "Enter a valid email address."; return; }
    const error = await requestCode($("eBtn"));
    if (error) { $("eErr").textContent = error; return; }
    $("sentTo").textContent = email;
    $("stepEmail").classList.add("hidden");
    $("stepCode").classList.remove("hidden");
    boxes.forEach(b => (b.value = ""));
    boxes[0].focus();
  });

  $("fCode").addEventListener("submit", async e => {
    e.preventDefault();
    $("cErr").textContent = $("cOk").textContent = "";
    if (code().length !== 6) { $("cErr").textContent = "Enter all 6 digits."; return; }
    $("cBtn").disabled = true;
    const name = $("name").value.trim();
    const r = await post("/auth/otp/verify", { email, code: code(), name }).catch(() => ({ ok: false, error: "Couldn't reach the server." }));
    if (r.ok) { location.replace("/"); return; }
    $("cBtn").disabled = false;
    $("cErr").textContent = r.error || "That code didn't work.";
    boxes.forEach(b => (b.value = ""));
    boxes[0].focus();
  });

  $("resend").addEventListener("click", async () => {
    const error = await requestCode($("resend"));
    if (error) $("cErr").textContent = error; else $("cOk").textContent = "New code sent. Check your inbox (and spam folder).";
  });

  $("back").addEventListener("click", () => {
    clearInterval(timer);
    $("stepCode").classList.add("hidden");
    $("stepEmail").classList.remove("hidden");
    $("email").focus();
  });
  $("email").focus();
})();
