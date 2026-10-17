/* Theo's Airconditioning Services — site interactions */
(function () {
  "use strict";

  const BUSINESS_EMAIL = "theoacservices2026@gmail.com";
  // Opening hours in Philippine time (24h). null = closed.
  const HOURS = [
    { day: "Sunday", open: null, close: null, label: "By appointment" },
    { day: "Monday", open: 8, close: 18 },
    { day: "Tuesday", open: 8, close: 18 },
    { day: "Wednesday", open: 8, close: 18 },
    { day: "Thursday", open: 8, close: 18 },
    { day: "Friday", open: 8, close: 18 },
    { day: "Saturday", open: 8, close: 17 }
  ];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- Header: scroll state, mobile menu, active link ---------- */
  const header = $(".site-header");
  const onScroll = () => header && header.classList.toggle("is-scrolled", window.scrollY > 10);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const toggle = $(".nav__toggle");
  const setMenu = (open) => {
    document.body.classList.toggle("nav-open", open);
    if (toggle) {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    }
  };
  if (toggle) toggle.addEventListener("click", () => setMenu(!document.body.classList.contains("nav-open")));
  $$(".nav__backdrop, .nav__panel a").forEach((el) => el.addEventListener("click", () => setMenu(false)));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });
  window.addEventListener("resize", () => { if (window.innerWidth > 960) setMenu(false); });

  const page = document.body.dataset.page;
  $$(".nav__link").forEach((link) => {
    if (link.dataset.page === page) { link.classList.add("is-active"); link.setAttribute("aria-current", "page"); }
  });

  /* ---------- Hero slider ---------- */
  const hero = $(".hero");
  if (hero) {
    const slides = $$(".slide", hero);
    const dots = $$(".hero__dot", hero);
    const counter = $(".hero__counter", hero);
    const DURATION = 6000;
    let index = 0;
    let timer = null;
    hero.style.setProperty("--slide-ms", DURATION + "ms");

    const go = (i) => {
      index = (i + slides.length) % slides.length;
      slides.forEach((s, n) => {
        const active = n === index;
        s.classList.toggle("is-active", active);
        s.setAttribute("aria-hidden", String(!active));
        $$("a, button", s).forEach((el) => (el.tabIndex = active ? 0 : -1));
      });
      dots.forEach((d, n) => {
        d.classList.remove("is-active");
        d.setAttribute("aria-selected", String(n === index));
      });
      // Restart the progress animation on the active dot.
      void dots[index].offsetWidth;
      dots[index].classList.add("is-active");
      if (counter) counter.textContent = String(index + 1).padStart(2, "0") + " / " + String(slides.length).padStart(2, "0");
    };
    const play = () => { stop(); timer = setInterval(() => go(index + 1), DURATION); hero.classList.remove("is-paused"); };
    const stop = () => { clearInterval(timer); timer = null; };
    const restart = () => { if (!hero.classList.contains("is-paused")) play(); };

    dots.forEach((d, n) => d.addEventListener("click", () => { go(n); restart(); }));
    $(".hero__arrow--prev", hero).addEventListener("click", () => { go(index - 1); restart(); });
    $(".hero__arrow--next", hero).addEventListener("click", () => { go(index + 1); restart(); });
    hero.addEventListener("mouseenter", () => { stop(); hero.classList.add("is-paused"); });
    hero.addEventListener("mouseleave", play);
    hero.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { go(index + 1); restart(); }
      if (e.key === "ArrowLeft") { go(index - 1); restart(); }
    });
    let startX = null;
    hero.addEventListener("touchstart", (e) => { startX = e.touches[0].clientX; }, { passive: true });
    hero.addEventListener("touchend", (e) => {
      if (startX === null) return;
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 45) { go(index + (dx < 0 ? 1 : -1)); play(); }
      startX = null;
    });
    document.addEventListener("visibilitychange", () => (document.hidden ? stop() : play()));
    go(0);
    play();
  }

  /* ---------- Filters (products & portfolio) ---------- */
  $$("[data-filter-group]").forEach((group) => {
    const target = $(group.dataset.filterGroup);
    if (!target) return;
    const items = $$("[data-cat]", target);
    $$(".chip", group).forEach((chip) => {
      chip.addEventListener("click", () => {
        $$(".chip", group).forEach((c) => { c.classList.remove("is-active"); c.setAttribute("aria-pressed", "false"); });
        chip.classList.add("is-active");
        chip.setAttribute("aria-pressed", "true");
        const f = chip.dataset.filter;
        items.forEach((it) => {
          const show = f === "all" || it.dataset.cat.split(" ").includes(f);
          it.classList.toggle("is-hidden", !show);
          if (show) it.classList.add("is-visible");
        });
      });
    });
  });

  /* ---------- Reveal on scroll + counters ---------- */
  const animateCount = (el) => {
    const end = parseFloat(el.dataset.count);
    const dur = 1400;
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min((t - t0) / dur, 1);
      el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3))).toLocaleString();
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        $$("[data-count]", entry.target).forEach(animateCount);
        if (entry.target.dataset.count) animateCount(entry.target);
        io.unobserve(entry.target);
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
    $$(".reveal, .stats").forEach((el) => io.observe(el));
  } else {
    $$(".reveal").forEach((el) => el.classList.add("is-visible"));
    $$("[data-count]").forEach((el) => (el.textContent = el.dataset.count));
  }

  /* ---------- Opening hours + live "open now" widget ---------- */
  const manilaNow = () => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila", weekday: "long", hour: "numeric", minute: "numeric", hour12: false
    }).formatToParts(new Date());
    const get = (t) => (parts.find((p) => p.type === t) || {}).value;
    return { day: get("weekday"), hour: (parseInt(get("hour"), 10) % 24) + parseInt(get("minute"), 10) / 60 };
  };
  const fmt = (h) => {
    const suffix = h >= 12 ? "PM" : "AM";
    const hr = h % 12 === 0 ? 12 : h % 12;
    return hr + ":00 " + suffix;
  };
  $$("[data-hours]").forEach((list) => {
    const now = manilaNow();
    list.innerHTML = HOURS.slice(1).concat(HOURS[0]).map((h) =>
      '<li class="' + (h.day === now.day ? "is-today" : "") + '"><span>' + h.day + "</span><span>" +
      (h.open === null ? h.label : fmt(h.open) + " – " + fmt(h.close)) + "</span></li>"
    ).join("");
  });
  $$("[data-open-status]").forEach((el) => {
    const now = manilaNow();
    const today = HOURS.find((h) => h.day === now.day);
    const open = today && today.open !== null && now.hour >= today.open && now.hour < today.close;
    el.textContent = open ? "Open now" : "Closed now";
    el.classList.toggle("live--closed", !open);
  });

  /* ---------- Quote estimator widget ---------- */
  const est = $("#estimator");
  if (est) {
    // Indicative price ranges in PHP per unit.
    const RATES = {
      cleaning: { window: [800, 1200], split: [1500, 2500], cassette: [3000, 4500], floor: [2800, 4000] },
      repair: { window: [1000, 3500], split: [1500, 5000], cassette: [2500, 7000], floor: [2500, 6500] },
      installation: { window: [1500, 2500], split: [4500, 7500], cassette: [9000, 15000], floor: [7000, 12000] },
      freon: { window: [1500, 2500], split: [2500, 4500], cassette: [4500, 7000], floor: [4000, 6500] }
    };
    const qty = $("#est-qty", est);
    const out = $("#est-total", est);
    const update = () => {
      const svc = $("#est-service", est).value;
      const type = $("#est-type", est).value;
      const n = Math.max(1, Math.min(20, parseInt(qty.value, 10) || 1));
      qty.value = n;
      // 10% multi-unit discount from 3 units up.
      const disc = n >= 3 ? 0.9 : 1;
      const [lo, hi] = RATES[svc][type].map((v) => Math.round((v * n * disc) / 50) * 50);
      out.textContent = "₱" + lo.toLocaleString() + " – ₱" + hi.toLocaleString();
      $("#est-disc", est).hidden = n < 3;
    };
    $$("select, input", est).forEach((el) => el.addEventListener("input", update));
    $$("[data-step]", est).forEach((b) => b.addEventListener("click", () => {
      qty.value = (parseInt(qty.value, 10) || 1) + parseInt(b.dataset.step, 10);
      update();
    }));
    update();
  }

  /* ---------- Portfolio lightbox ---------- */
  const lb = $(".lightbox");
  if (lb) {
    const close = () => lb.classList.remove("is-open");
    $$(".work").forEach((w) => {
      const open = () => {
        $("img", lb).src = $("img", w).src;
        $("img", lb).alt = $("img", w).alt;
        $("h3", lb).textContent = $("h3", w).textContent;
        $("p", lb).textContent = w.dataset.desc || "";
        lb.classList.add("is-open");
        $(".lightbox__close", lb).focus();
      };
      w.addEventListener("click", open);
      w.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    });
    lb.addEventListener("click", (e) => { if (e.target === lb) close(); });
    $(".lightbox__close", lb).addEventListener("click", close);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  }

  /* ---------- Contact form ---------- */
  const form = $("#contact-form");
  if (form) {
    const status = $(".form-status", form);
    const submitBtn = $("button[type=submit]", form);
    const rules = {
      name: (v) => v.trim().length >= 2 || "Please enter your full name.",
      address: (v) => v.trim().length >= 5 || "Please enter your address (barangay, city).",
      phone: (v) => /^(\+?63|0)9\d{9}$/.test(v.replace(/[\s-]/g, "")) || "Enter a valid PH mobile number, e.g. 0975 650 1762.",
      email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || "Enter a valid email address."
    };
    const setError = (field, msg) => {
      const wrap = field.closest(".field");
      wrap.classList.toggle("is-invalid", !!msg);
      field.setAttribute("aria-invalid", String(!!msg));
      $(".field__error", wrap).textContent = msg || "";
    };
    const validateField = (field) => {
      const rule = rules[field.name];
      if (!rule) return true;
      const res = rule(field.value);
      setError(field, res === true ? "" : res);
      return res === true;
    };
    Object.keys(rules).forEach((name) => {
      const f = form.elements[name];
      f.addEventListener("blur", () => validateField(f));
      f.addEventListener("input", () => { if (f.closest(".field").classList.contains("is-invalid")) validateField(f); });
    });

    // Pre-select a service from ?service=... links.
    const pre = new URLSearchParams(location.search).get("service");
    if (pre) $$("input[name=service]", form).forEach((c) => { if (c.value.toLowerCase().startsWith(pre.toLowerCase())) c.checked = true; });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      status.className = "form-status";
      let ok = Object.keys(rules).map((n) => validateField(form.elements[n])).every(Boolean);
      const services = $$("input[name=service]:checked", form).map((c) => c.value);
      const svcWrap = $(".service-field", form);
      svcWrap.classList.toggle("is-invalid", services.length === 0);
      $(".field__error", svcWrap).textContent = services.length ? "" : "Pick at least one service.";
      if (!services.length) ok = false;
      if (!ok) {
        const first = $(".is-invalid input, .is-invalid select, .is-invalid textarea", form);
        if (first) first.focus();
        return;
      }

      const data = {
        name: form.elements.name.value.trim(),
        address: form.elements.address.value.trim(),
        phone: form.elements.phone.value.trim(),
        email: form.elements.email.value.trim(),
        service: services.join(", "),
        units: form.elements.units.value,
        schedule: form.elements.schedule.value || "Flexible",
        message: form.elements.message.value.trim(),
        _subject: "New service request — " + services.join(", "),
        _template: "table",
        _captcha: "false"
      };

      submitBtn.classList.add("is-loading");
      try {
        // FormSubmit relays the request to the business Gmail (no backend needed).
        const res = await fetch("https://formsubmit.co/ajax/" + BUSINESS_EMAIL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        status.className = "form-status is-success";
        status.textContent = "Salamat, " + data.name.split(" ")[0] + "! Your request was sent. Theo's team will call or text you within the day.";
        form.reset();
      } catch (err) {
        // Fallback: open the visitor's email app with the request pre-filled.
        const body = Object.entries(data).filter(([k]) => !k.startsWith("_"))
          .map(([k, v]) => k.charAt(0).toUpperCase() + k.slice(1) + ": " + v).join("\n");
        location.href = "mailto:" + BUSINESS_EMAIL + "?subject=" + encodeURIComponent(data._subject) + "&body=" + encodeURIComponent(body);
        status.className = "form-status is-error";
        status.innerHTML = 'We opened your email app so you can send the request. You can also call or text <a href="tel:+639756501762"><strong>0975 650 1762</strong></a>.';
      } finally {
        submitBtn.classList.remove("is-loading");
        status.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }

  /* ---------- Floating contact widget ---------- */
  const fab = $(".fab");
  if (fab) {
    const btn = $(".fab__btn", fab);
    btn.addEventListener("click", () => {
      const open = fab.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("click", (e) => { if (!fab.contains(e.target)) { fab.classList.remove("is-open"); btn.setAttribute("aria-expanded", "false"); } });
  }

  $$("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));
})();
