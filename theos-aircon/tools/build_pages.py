"""Assembles the five static pages for Theo's Airconditioning Services."""
import pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent

# Stroke icons (24x24, lucide-style)
def icon(paths, extra=""):
    return ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
            f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"{extra}>{paths}</svg>')

I = {
    "arrow": icon('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    "left": icon('<path d="M15 18l-6-6 6-6"/>'),
    "right": icon('<path d="M9 18l6-6-6-6"/>'),
    "phone": icon('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>'),
    "mail": icon('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/>'),
    "pin": icon('<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>'),
    "clock": icon('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
    "calendar": icon('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
    "user": icon('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    "snow": icon('<path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M19.1 4.9 4.9 19.1"/>'),
    "flame": icon('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.3.4 1.4 1.4 2.8 2.5 2.8z"/>'),
    "wind": icon('<path d="M17.7 7.7A2.5 2.5 0 1 1 19.5 12H2M9.6 4.6A2 2 0 1 1 11 8H2M12.6 19.4A2 2 0 1 0 14 16H2"/>'),
    "droplet": icon('<path d="M12 2.7l5.7 5.6a8 8 0 1 1-11.3 0z"/>'),
    "wrench": icon('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>'),
    "shield": icon('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>'),
    "star": icon('<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>'),
    "zap": icon('<path d="M13 2L3 14h9l-1 8 10-12h-9z"/>'),
    "leaf": icon('<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z"/><path d="M2 21c0-3 1.9-5.4 5.1-6"/>'),
    "heart": icon('<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z"/>'),
    "eye": icon('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
    "tools": icon('<path d="M3 21l6-6M14.5 4.5l5 5M12 7l5 5-8 8-5-5z"/>'),
    "file": icon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>'),
    "award": icon('<circle cx="12" cy="8" r="6"/><path d="M15.5 13 17 22l-5-3-5 3 1.5-9"/>'),
    "building": icon('<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01"/>'),
    "plus": icon('<path d="M12 5v14M5 12h14"/>'),
    "chat": icon('<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.5-8.5h.5a8.5 8.5 0 0 1 8 8z"/>'),
    "fb": '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 9V7c0-.9.6-1 1-1h3V2h-4c-3.3 0-4 2.4-4 4v3H7v4h3v9h4v-9h3.5l.5-4z"/></svg>',
    "ig": icon('<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>'),
    "tt": '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.3v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.5a6 6 0 1 0 5.1 5.9V9a7.6 7.6 0 0 0 4.5 1.4V7.1a4.3 4.3 0 0 1-3.4-1.3z"/></svg>',
    "msg": '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.5 2 2 6.1 2 11.3c0 2.9 1.4 5.5 3.7 7.2V22l3.4-1.9c.9.3 1.9.4 2.9.4 5.5 0 10-4.1 10-9.3S17.5 2 12 2zm1 12.5-2.6-2.7-5 2.7 5.5-5.8 2.6 2.7 5-2.7z"/></svg>',
}

PHONE_DISPLAY = "0975 650 1762"
PHONE_TEL = "+639756501762"
EMAIL = "theoacservices2026@gmail.com"
FB = "https://www.facebook.com/"  # replace with the business page URL
IG = "https://www.instagram.com/"
TT = "https://www.tiktok.com/"
MESSENGER = "https://m.me/"

NAV = [
    ("index.html", "home", "Home"),
    ("about.html", "about", "About Us"),
    ("index.html#products", "products", "Products"),
    ("services.html", "services", "Services"),
    ("portfolio.html", "portfolio", "Portfolio"),
    ("contact.html", "contact", "Contact Us"),
]

def head(title, desc, page):
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta name="theme-color" content="#0A1F3C">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:type" content="website">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/css/style.css">
</head>
<body data-page="{page}">
<a class="skip-link" href="#main">Skip to content</a>
"""

def brand(light=False):
    logo = "logo-light.svg" if light else "logo.svg"
    return (f"""<a class="brand" href="index.html" aria-label="Theo's Airconditioning Services — Home">
      <img src="assets/img/{logo}" alt="Theo's logo" width="46" height="42">
      <span class="brand__text"><span class="brand__name">THEO&#8217;S</span><span class="brand__tag">Airconditioning Services</span></span>
    </a>""")

def header():
    links = "\n".join(
        f'          <li><a class="nav__link" data-page="{p}" href="{href}">{label}</a></li>'
        for href, p, label in NAV)
    logo = brand().replace('<img src="assets/img/logo.svg"', '<img class="logo-on-light" src="assets/img/logo.svg"').replace(
        'width="46" height="42">', 'width="46" height="42"><img class="logo-on-dark" src="assets/img/logo-light.svg" alt="" width="46" height="42">', 1)
    return f"""<header class="site-header">
  <div class="container nav">
    {logo}
    <button class="nav__toggle" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="nav-panel"><span></span><span></span><span></span></button>
    <nav class="nav__panel" id="nav-panel" aria-label="Main">
      <ul class="nav__menu">
{links}
      </ul>
      <a class="btn btn--primary btn--sm nav__cta" href="contact.html">Book a Service {I['arrow']}</a>
      <div class="nav__panel-foot">Call or text us<a href="tel:{PHONE_TEL}">{PHONE_DISPLAY}</a><a href="mailto:{EMAIL}">{EMAIL}</a></div>
    </nav>
  </div>
  <div class="nav__backdrop"></div>
</header>
"""

def footer():
    return f"""<section class="section" style="padding-top:0">
  <div class="container">
    <div class="cta-band reveal">
      <div>
        <h2>Feeling the Pampanga heat?</h2>
        <p>Get a free on-site check and an honest quote. Same-day service around San Fernando when slots are open.</p>
      </div>
      <div class="hero__actions">
        <a class="btn btn--primary" href="contact.html">Request a Quote {I['arrow']}</a>
        <a class="btn btn--light" href="tel:{PHONE_TEL}">{I['phone']} {PHONE_DISPLAY}</a>
      </div>
    </div>
  </div>
</section>
</main>

<footer class="site-footer">
  <div class="container">
    <div class="footer__grid">
      <div>
        {brand(light=True)}
        <div class="brand__services">Supply &middot; Installation &middot; Maintenance &middot; Repair</div>
        <p style="margin-top:14px;max-width:300px">Cleaning, repair, installation and HVAC care for homes and businesses in San Fernando, Pampanga and nearby towns.</p>
        <div class="socials">
          <a href="{FB}" target="_blank" rel="noopener" aria-label="Facebook">{I['fb']}</a>
          <a href="{IG}" target="_blank" rel="noopener" aria-label="Instagram">{I['ig']}</a>
          <a href="{TT}" target="_blank" rel="noopener" aria-label="TikTok">{I['tt']}</a>
          <a href="{MESSENGER}" target="_blank" rel="noopener" aria-label="Messenger">{I['msg']}</a>
        </div>
      </div>
      <div>
        <h4>Company</h4>
        <ul class="footer__links">
          <li><a href="about.html">About Us</a></li>
          <li><a href="index.html#products">Products</a></li>
          <li><a href="portfolio.html">Portfolio</a></li>
          <li><a href="contact.html">Contact Us</a></li>
        </ul>
      </div>
      <div>
        <h4>Services</h4>
        <ul class="footer__links">
          <li><a href="services.html#cleaning">Aircon Cleaning</a></li>
          <li><a href="services.html#heating">Heating</a></li>
          <li><a href="services.html#ventilation">Ventilation</a></li>
          <li><a href="services.html#aircon">Installation &amp; Repair</a></li>
        </ul>
      </div>
      <div>
        <h4>Get in touch</h4>
        <ul class="footer__links footer__contact">
          <li>{I['pin']}<span>San Fernando, Pampanga, Philippines</span></li>
          <li>{I['phone']}<a href="tel:{PHONE_TEL}">{PHONE_DISPLAY}</a></li>
          <li>{I['mail']}<a href="mailto:{EMAIL}">{EMAIL}</a></li>
          <li>{I['clock']}<span>Mon–Fri 8AM–6PM · Sat 8AM–5PM</span></li>
        </ul>
      </div>
    </div>
    <div class="footer__bottom">
      <span>© <span data-year>2026</span> Theo's Airconditioning Services. All rights reserved.</span>
      <span>Serving San Fernando, Pampanga since May 2026</span>
    </div>
  </div>
</footer>

<div class="fab">
  <div class="fab__menu">
    <a class="fab__item" href="tel:{PHONE_TEL}">{I['phone']} Call us</a>
    <a class="fab__item" href="{MESSENGER}" target="_blank" rel="noopener">{I['chat']} Messenger</a>
    <a class="fab__item" href="contact.html">{I['calendar']} Book a service</a>
  </div>
  <button class="fab__btn" type="button" aria-label="Quick contact" aria-expanded="false">{I['plus']}</button>
</div>

<script src="assets/js/main.js" defer></script>
</body>
</html>
"""

def page_hero(crumb, eyebrow, title, text):
    return f"""<section class="page-hero">
  <div class="container">
    <div class="breadcrumb"><a href="index.html">Home</a><span>/</span><span>{crumb}</span></div>
    <span class="eyebrow">{eyebrow}</span>
    <h1>{title}</h1>
    <p>{text}</p>
  </div>
</section>
"""

# ------------------------------------------------------------------ HOME
SLIDES = [
    ("slide-living.svg", "Inverter Split-Type · Living Room", "Cool comfort,<br><span class=\"text-grad\">installed right.</span>",
     "Quiet, energy-saving inverter split-types fitted cleanly into modern living spaces — neat piping, no mess."),
    ("slide-bedroom.svg", "Wall-Mounted Inverter · Bedroom", "Sleep cool all night,<br>pay less every month.",
     "Whisper-quiet bedroom units with sleep mode and smart temperature control for restful Pampanga nights."),
    ("slide-dining.svg", "Clean Installs · Modern Homes", "Neat work<br>you can see.",
     "Level mounting, hidden piping and tidy finishing — every unit tested before we leave your home."),
    ("slide-office.svg", "Lofts, Studios &amp; Home Offices", "Quiet cooling<br>for work and rest.",
     "Right-sized inverter units for condos, lofts and home offices — cool, quiet and easy on your electric bill."),
    ("slide-office.svg", "Floor-Standing · Offices &amp; Shops", "Big rooms.<br>Strong, steady cooling.",
     "High-capacity floor-standing units for offices, shops, clinics and function rooms — supplied and installed by our team."),
]

def slide(i, s):
    img, tag, h, p = s
    first = i == 0
    return f"""    <div class="slide{' is-active' if first else ''}" role="group" aria-roledescription="slide" aria-label="{i+1} of {len(SLIDES)}">
      <img class="slide__img" src="assets/img/{img}" alt="{tag.replace('&amp;', 'and')} aircon installation in a modern home" {'fetchpriority="high"' if first else 'loading="lazy"'}>
      <div class="container slide__content">
        <span class="slide__tag">{tag}</span>
        <{'h1' if first else 'h2'} style="font-size:clamp(2.2rem,5vw,3.8rem)">{h}</{'h1' if first else 'h2'}>
        <p>{p}</p>
        <div class="hero__actions">
          <a class="btn btn--primary" href="contact.html">Book a Service {I['arrow']}</a>
          <a class="btn btn--light" href="#products">View Products</a>
        </div>
      </div>
    </div>"""

PRODUCTS = [
    ("split", "prod-split.svg", "Best Seller", "", "Inverter Split-Type", "Quiet wall-mounted unit with up to 60% energy savings vs. non-inverter.",
     ["1.0 – 2.5 HP", "Inverter", "R32"], "₱28,500"),
    ("window", "prod-window.svg", "Budget Pick", "", "Window-Type Aircon", "Easy to install, simple to maintain — ideal for bedrooms and small rooms.",
     ["0.6 – 1.5 HP", "Remote", "Timer"], "₱15,900"),
    ("commercial", "prod-cassette.svg", "Commercial", "", "Ceiling Cassette", "4-way 360° airflow, hidden in the ceiling for clean, modern interiors.",
     ["2.0 – 5.0 HP", "4-way flow", "Inverter"], "₱68,000"),
    ("commercial", "prod-floor.svg", "Commercial", "", "Floor-Standing Unit", "High-capacity cooling for offices, shops, halls and function rooms.",
     ["3.0 – 5.0 HP", "Auto swing", "LED panel"], "₱75,000"),
    ("portable", "prod-portable.svg", "Plug &amp; Play", "", "Portable Aircon", "No installation needed — roll it to any room. Great for renters.",
     ["1.0 – 1.5 HP", "Dehumidifier", "Wheels"], "₱18,500"),
    ("split commercial", "prod-outdoor.svg", "Heat Pump", " badge--warm", "Inverter Heat Pump / Multi-Split", "One outdoor unit, multiple rooms. Cooling and heating in a single system.",
     ["2.0 – 4.0 HP", "Cool + Heat", "Multi-zone"], "₱85,000"),
]

def product(p):
    cat, img, badge, badge_cls, name, desc, specs, price = p
    spec = "".join(f"<li>{s}</li>" for s in specs)
    return f"""      <article class="card product reveal" data-cat="{cat}">
        <div class="product__media" data-product="{img[5:-4]}"><span class="badge{badge_cls}">{badge}</span><img src="assets/img/{img}" alt="{name}" loading="lazy"></div>
        <div class="product__body">
          <h3>{name}</h3>
          <p>{desc}</p>
          <ul class="product__specs">{spec}</ul>
          <div class="product__foot">
            <div class="price"><small>Starts at</small>{price}</div>
            <a class="btn btn--ghost btn--sm" href="contact.html?service=Installation">Inquire</a>
          </div>
        </div>
      </article>"""

home = head("Theo's Airconditioning Services | Aircon Cleaning, Repair & Installation in San Fernando, Pampanga",
            "Trusted aircon cleaning, repair, installation and HVAC services in San Fernando, Pampanga. Call 0975 650 1762 for a free quote.", "home")
home += header()
home += f"""<main id="main">
<section class="hero" aria-roledescription="carousel" aria-label="Aircon products installed in modern homes" tabindex="0">
{chr(10).join(slide(i, s) for i, s in enumerate(SLIDES))}
  <div class="container hero__controls">
    <div class="hero__dots" role="tablist" aria-label="Choose slide">
      {''.join(f'<button class="hero__dot" type="button" role="tab" aria-label="Slide {i+1}"></button>' for i in range(len(SLIDES)))}
    </div>
    <div style="display:flex;align-items:center;gap:16px">
      <span class="hero__counter">01 / 05</span>
      <div class="hero__arrows">
        <button class="hero__arrow hero__arrow--prev" type="button" aria-label="Previous slide">{I['left']}</button>
        <button class="hero__arrow hero__arrow--next" type="button" aria-label="Next slide">{I['right']}</button>
      </div>
    </div>
  </div>
</section>

<section class="trust" aria-label="Why customers choose us">
  <div class="container trust__grid">
    <div class="trust__item"><span class="icon">{I['shield']}</span><div><strong>Service Warranty</strong><span>On every job we do</span></div></div>
    <div class="trust__item"><span class="icon icon--cyan">{I['zap']}</span><div><strong>Same-Day Service</strong><span>Around San Fernando</span></div></div>
    <div class="trust__item"><span class="icon icon--warm">{I['star']}</span><div><strong>Free Assessment</strong><span>Honest, upfront quotes</span></div></div>
    <div class="trust__item"><span class="icon">{I['tools']}</span><div><strong>Trained Technicians</strong><span>Clean, careful work</span></div></div>
  </div>
</section>

<section class="section" id="products">
  <div class="container">
    <div class="section-head">
      <span class="eyebrow">Our Products</span>
      <h2>Aircon units for every room and budget</h2>
      <p class="lead">Sample units we supply and install — brand-new, with manufacturer warranty and professional installation by our own team.</p>
    </div>
    <div class="filters" data-filter-group="#product-grid" aria-label="Filter products">
      <button class="chip is-active" type="button" data-filter="all" aria-pressed="true">All</button>
      <button class="chip" type="button" data-filter="split" aria-pressed="false">Split-Type</button>
      <button class="chip" type="button" data-filter="window" aria-pressed="false">Window-Type</button>
      <button class="chip" type="button" data-filter="commercial" aria-pressed="false">Commercial</button>
      <button class="chip" type="button" data-filter="portable" aria-pressed="false">Portable</button>
    </div>
    <div class="grid grid--3" id="product-grid">
{chr(10).join(product(p) for p in PRODUCTS)}
    </div>
    <p class="form__note" style="margin-top:20px">Prices are sample starting prices for the unit only and may change with brand, capacity and supplier stock. Installation quoted separately after a free site check.</p>
  </div>
</section>

<section class="section section--alt">
  <div class="container">
    <div class="section-head center">
      <span class="eyebrow">What We Do</span>
      <h2>Complete HVAC care, from one local team</h2>
      <p class="lead">Cleaning, heating, ventilating and air conditioning — done right the first time.</p>
    </div>
    <div class="grid grid--4">
      <a class="card reveal" href="services.html#cleaning"><span class="icon icon--cyan">{I['droplet']}</span><h3>Aircon Cleaning</h3><p>Deep chemical wash and general cleaning to restore cooling and airflow.</p></a>
      <a class="card reveal reveal-delay-1" href="services.html#heating"><span class="icon icon--warm">{I['flame']}</span><h3>Heating</h3><p>Heat pump and water heater installation, servicing and repair.</p></a>
      <a class="card reveal reveal-delay-2" href="services.html#ventilation"><span class="icon">{I['wind']}</span><h3>Ventilation</h3><p>Exhaust, fresh-air and duct systems for healthier indoor air.</p></a>
      <a class="card reveal reveal-delay-3" href="services.html#aircon"><span class="icon">{I['snow']}</span><h3>Air Conditioning</h3><p>Installation, repair, freon recharge and preventive maintenance.</p></a>
    </div>
  </div>
</section>

<section class="section">
  <div class="container split">
    <div class="media-frame reveal">
      <img src="assets/img/slide-bedroom.svg" alt="Bedroom with a newly installed inverter split-type aircon" loading="lazy">
      <div class="floating-card"><span class="icon">{I['shield']}</span><div><strong>Clean installs</strong><span>Neat piping · tested before we leave</span></div></div>
    </div>
    <div class="reveal reveal-delay-1">
      <span class="eyebrow">Why Theo's</span>
      <h2>Local, reliable and easy to reach</h2>
      <p class="lead">We are a San Fernando-based team. That means faster response, fair prices and a technician who actually picks up the phone.</p>
      <ul class="checklist">
        <li>Free on-site assessment and transparent, itemized quotes</li>
        <li>On-time arrival with SMS updates before every visit</li>
        <li>We protect your floors and walls and clean up after the job</li>
        <li>After-service warranty and friendly follow-up</li>
      </ul>
      <a class="btn btn--primary" href="about.html">Meet the Team {I['arrow']}</a>
    </div>
  </div>
</section>

<section class="section section--dark">
  <div class="container">
    <div class="section-head center">
      <span class="eyebrow">How It Works</span>
      <h2>Book in minutes. Cool in hours.</h2>
    </div>
    <div class="grid grid--3 steps">
      <div class="card step reveal" style="background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.08)"><h3>Send a request</h3><p style="color:#9FB4CF">Fill in the form, call or message us. Tell us your unit type and the problem.</p></div>
      <div class="card step reveal reveal-delay-1" style="background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.08)"><h3>Get a clear quote</h3><p style="color:#9FB4CF">We confirm the schedule and give you an upfront price — no hidden charges.</p></div>
      <div class="card step reveal reveal-delay-2" style="background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.08)"><h3>Enjoy the cool</h3><p style="color:#9FB4CF">Our technician arrives on time, does the work, tests it and cleans up.</p></div>
    </div>
  </div>
</section>
"""
home += footer()

# ------------------------------------------------------------------ ABOUT
about = head("About Us | Theo's Airconditioning Services, San Fernando Pampanga",
             "Meet Theo and the team behind Theo's Airconditioning Services — a local HVAC business in San Fernando, Pampanga founded in May 2026.", "about")
about += header()
about += "<main id=\"main\">\n" + page_hero("About Us", "About Us", "Built on honest work<br>and cool homes.",
    "Theo's Airconditioning Services is a local HVAC team in San Fernando, Pampanga — started in May 2026 to give families and businesses aircon service they can rely on.")
about += f"""
<section class="section">
  <div class="container split">
    <div class="reveal">
      <span class="eyebrow">Our Story</span>
      <h2>From one technician to your go-to aircon team</h2>
      <p class="lead">Theo saw the same thing again and again around Pampanga: late technicians, unclear prices and units that broke down again a month after "repair".</p>
      <p>So in May 2026 he started Theo's Airconditioning Services with a simple promise — show up on time, explain the problem in plain words, charge a fair price and do the job properly. Every unit we touch is cleaned, tested and checked before we leave.</p>
      <p>Today we help homeowners, renters, small offices and shops across San Fernando and nearby towns keep cool through the hottest months of the year.</p>
    </div>
    <div class="reveal reveal-delay-1">
      <div class="timeline">
        <div class="timeline__item"><small>May 2026</small><h3>Theo's opens for business</h3><p>Started serving homes in San Fernando with cleaning and repair.</p></div>
        <div class="timeline__item"><small>2026</small><h3>Installation &amp; product supply</h3><p>Added brand-new unit supply and full installation packages.</p></div>
        <div class="timeline__item"><small>Next</small><h3>Commercial &amp; HVAC maintenance</h3><p>Growing into maintenance plans for offices, shops and clinics.</p></div>
      </div>
    </div>
  </div>
</section>

<section class="section section--alt" id="owner">
  <div class="container owner">
    <div class="owner__photo reveal" role="img" aria-label="Theo, owner of Theo's Airconditioning Services"><img src="assets/img/logo-light.svg" alt=""></div>
    <div class="reveal reveal-delay-1">
      <span class="eyebrow">Owner Profile</span>
      <h2>Theo</h2>
      <span class="role">Founder &amp; Owner · Lead Technician</span>
      <p class="lead">"I treat every home like it's my own family's. If I wouldn't be happy with the work, I won't leave it that way."</p>
      <p>Theo personally handles quotations, checks every installation and stays in touch with clients after the job. When you call, you talk to the owner.</p>
      <div class="owner__meta">
        <div class="meta-item"><span class="icon">{I['user']}</span><div><small>Owner</small><strong>Theo</strong></div></div>
        <div class="meta-item"><span class="icon icon--cyan">{I['calendar']}</span><div><small>Started</small><strong>May 2026</strong></div></div>
        <div class="meta-item"><span class="icon">{I['phone']}</span><div><small>Contact</small><strong><a href="tel:{PHONE_TEL}">{PHONE_DISPLAY}</a></strong></div></div>
        <div class="meta-item"><span class="icon icon--warm">{I['mail']}</span><div><small>Gmail</small><strong><a href="mailto:{EMAIL}">{EMAIL}</a></strong></div></div>
      </div>
      <a class="btn btn--primary" href="contact.html">Talk to Theo {I['arrow']}</a>
    </div>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="section-head center">
      <span class="eyebrow">Our Values</span>
      <h2>What we stand for</h2>
    </div>
    <div class="grid grid--4">
      <div class="card reveal"><span class="icon">{I['clock']}</span><h3>On Time</h3><p>We respect your schedule. If we are running late, you'll hear it from us first.</p></div>
      <div class="card reveal reveal-delay-1"><span class="icon icon--cyan">{I['eye']}</span><h3>Transparent</h3><p>Clear, itemized quotes before any work begins. No surprise charges.</p></div>
      <div class="card reveal reveal-delay-2"><span class="icon icon--warm">{I['heart']}</span><h3>Customer First</h3><p>Friendly service, clean work areas and honest advice — even if it means a smaller job.</p></div>
      <div class="card reveal reveal-delay-3"><span class="icon">{I['leaf']}</span><h3>Energy Smart</h3><p>We recommend efficient inverter units and maintenance that lowers your electric bill.</p></div>
    </div>
  </div>
</section>

<section class="section section--alt">
  <div class="container">
    <div class="section-head center">
      <span class="eyebrow">Our Team</span>
      <h2>The people behind the cool</h2>
      <p class="lead">A small, hands-on crew that takes pride in clean, careful work.</p>
    </div>
    <div class="grid grid--3">
      <div class="card team-card reveal"><div class="avatar">T</div><h3>Theo</h3><span class="role">Owner &amp; Lead Technician</span><p>Quotations, installations and quality checks on every job.</p></div>
      <div class="card team-card reveal reveal-delay-1"><div class="avatar avatar--alt">{I['tools'].replace('<svg', '<svg width="36" height="36"')}</div><h3>Service Technicians</h3><span class="role">Cleaning · Repair · Installation</span><p>Trained hands for chemical washes, troubleshooting and neat installs.</p></div>
      <div class="card team-card reveal reveal-delay-2"><div class="avatar avatar--warm">{I['chat'].replace('<svg', '<svg width="36" height="36"')}</div><h3>Customer Care</h3><span class="role">Bookings &amp; Follow-ups</span><p>Confirms your schedule, sends reminders and checks in after service.</p></div>
    </div>
  </div>
</section>
"""
about += footer()

# ------------------------------------------------------------------ SERVICES
def svc_block(id_, media_cls, pill, big_icon, eyebrow, title, text, tags, price, unit, service_q):
    tg = "".join(f'<span class="tag">{t}</span>' for t in tags)
    big = big_icon.replace("<svg", '<svg class="big"').replace('stroke-width="2"', 'stroke-width="1.4"')
    return f"""    <article class="service-detail" id="{id_}">
      <div class="service-detail__media {media_cls} reveal"><span class="pill">{pill}</span>{big}</div>
      <div class="reveal reveal-delay-1">
        <span class="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p class="lead">{text}</p>
        <div class="tags">{tg}</div>
        <div class="price-line">Starts at <strong>{price}</strong> {unit}</div>
        <a class="btn btn--primary" href="contact.html?service={service_q}">Book {eyebrow} {I['arrow']}</a>
      </div>
    </article>"""

services = head("Services | Aircon Cleaning, Heating, Ventilation & Air Conditioning — Theo's",
                "Aircon cleaning, heating, ventilation and air conditioning services in San Fernando, Pampanga. Installation, repair, freon recharge and maintenance.", "services")
services += header()
services += "<main id=\"main\">\n" + page_hero("Services", "Our Services", "Cleaning, Heating,<br>Ventilating &amp; Air Conditioning",
    "Everything your home or business needs to stay comfortable — done by trained technicians with clear pricing and a service warranty.")
services += f"""
<section class="section">
  <div class="container">
{svc_block("cleaning", "service-detail__media--cyan", "Most booked", I['droplet'], "Cleaning", "Aircon Cleaning &amp; Chemical Wash",
  "Dirty coils and filters make your aircon work harder and cool less. Our deep cleaning restores airflow, removes odor and helps cut your electric bill.",
  ["General cleaning", "Chemical wash", "Coil &amp; filter cleaning", "Drain line flushing", "Odor &amp; mold removal", "Performance check"], "₱800", "/ window-type unit", "Cleaning")}
{svc_block("heating", "service-detail__media--warm", "Cool + Heat", I['flame'], "Heating", "Heating Systems &amp; Heat Pumps",
  "For cooler months, early mornings and hot-water needs: we install and service heat-pump aircons and water heaters for homes and small businesses.",
  ["Heat pump aircon", "Water heater installation", "Thermostat setup", "Heating repair", "Safety inspection"], "₱1,500", "/ service visit", "Heating")}
{svc_block("ventilation", "service-detail__media--cool", "Fresh air", I['wind'], "Ventilation", "Ventilation &amp; Air Quality",
  "Good airflow keeps kitchens, bathrooms and offices fresh and less humid. We design and install exhaust and fresh-air systems that actually move air.",
  ["Exhaust fan installation", "Kitchen &amp; range hood ducting", "Fresh-air systems", "Duct cleaning", "Humidity control"], "₱1,200", "/ exhaust install", "Ventilation")}
{svc_block("aircon", "service-detail__media--navy", "Full service", I['snow'], "Air Conditioning", "Installation, Repair &amp; Maintenance",
  "Brand-new unit supply and installation, fast troubleshooting and repair, freon recharge, relocation and preventive maintenance plans for every aircon type.",
  ["Unit installation", "Repair &amp; troubleshooting", "Freon recharge", "Relocation / dismantling", "PMS contracts", "Window, split, cassette, floor-standing"], "₱1,500", "/ installation (window-type)", "Installation")}
  </div>
</section>

<section class="section section--alt">
  <div class="container">
    <div class="section-head center">
      <span class="eyebrow">Maintenance Plans</span>
      <h2>Keep it cool all year</h2>
      <p class="lead">Regular cleaning keeps units efficient and prevents costly breakdowns.</p>
    </div>
    <div class="grid grid--3" style="align-items:stretch">
      <div class="card plan reveal"><h3>Basic Care</h3><p>For 1–2 units at home</p><div class="plan__price">₱1,500 <small>/ visit</small></div>
        <ul class="checklist"><li>General cleaning</li><li>Filter &amp; drain check</li><li>Cooling performance test</li></ul>
        <a class="btn btn--ghost" href="contact.html?service=Cleaning">Choose Basic</a></div>
      <div class="card plan plan--featured reveal reveal-delay-1"><span class="plan__ribbon">Most Popular</span><h3>Home Plus</h3><p>Twice a year, up to 3 units</p><div class="plan__price">₱4,500 <small style="color:#9FB4CF">/ year</small></div>
        <ul class="checklist"><li>2 chemical washes per unit</li><li>Freon pressure check</li><li>Priority scheduling</li><li>10% off repairs</li></ul>
        <a class="btn btn--primary" href="contact.html?service=Cleaning">Choose Home Plus</a></div>
      <div class="card plan reveal reveal-delay-2"><h3>Business PMS</h3><p>Offices, shops &amp; clinics</p><div class="plan__price">Custom <small>quote</small></div>
        <ul class="checklist"><li>Quarterly preventive maintenance</li><li>Service reports per unit</li><li>Emergency call priority</li></ul>
        <a class="btn btn--ghost" href="contact.html?service=Maintenance">Request Quote</a></div>
    </div>
    <p class="form__note" style="text-align:center;margin-top:20px">Sample rates — final price depends on unit type, capacity and condition. Assessment is free.</p>
  </div>
</section>
"""
services += footer()

# ------------------------------------------------------------------ PORTFOLIO
WORKS = [
    ("install", "slide-living.svg", "Installation", "2.0 HP Inverter Split-Type", "Living room · Dolores", "Installed",
     "Supply and installation of a 2.0 HP inverter split-type with concealed piping and a clean wall finish."),
    ("cleaning", "slide-bedroom.svg", "Cleaning", "Bedroom Chemical Wash", "Sindalan", "Serviced",
     "Full chemical wash of a 1.0 HP wall-mounted unit — cooling restored and musty odor removed."),
    ("install commercial", "slide-dining.svg", "Commercial", "Ceiling Cassette Fit-Out", "Restaurant · Sto. Niño", "Installed",
     "Two 3.0 HP ceiling cassette units for an open dining area with even 360° airflow."),
    ("product commercial", "slide-office.svg", "Sold Unit", "Floor-Standing Unit", "Office · City of San Fernando", "Sold &amp; installed",
     "Supplied and installed a 5.0 HP floor-standing unit for a small office and reception area."),
    ("product", "slide-exterior.svg", "Sold Units", "Whole-Home Multi-Split", "Modern home · Telabastagan", "Sold &amp; installed",
     "Multi-room inverter system with two outdoor condensers on a raised, ventilated mounting."),
    ("cleaning", "prod-window.svg", "Repair", "Window-Type Repair", "Apartment · Del Pilar", "Repaired",
     "Diagnosed a failed capacitor and recharged freon — unit back to full cooling in one visit."),
]

def work(w):
    cat, img, badge, title, loc, status, desc = w
    return f"""      <article class="work reveal" data-cat="{cat}" data-desc="{desc}" tabindex="0" role="button" aria-label="View project: {title}">
        <span class="badge">{badge}</span>
        <div class="work__img"><img src="assets/img/{img}" alt="{title}" loading="lazy"{' style="object-fit:contain;background:linear-gradient(160deg,#EAF5FE,#F6FAFE);padding:24px"' if img.startswith('prod') else ''}></div>
        <div class="work__body"><h3>{title}</h3><div class="work__meta"><span>{loc}</span><span>{status}</span></div></div>
      </article>"""

portfolio = head("Portfolio | Projects, Sold Units & Credentials — Theo's Airconditioning Services",
                 "Sample aircon installations, cleaning jobs, sold units and business credentials of Theo's Airconditioning Services, San Fernando, Pampanga.", "portfolio")
portfolio += header()
portfolio += "<main id=\"main\">\n" + page_hero("Portfolio", "Portfolio", "Our work speaks<br>for itself.",
    "A look at sample finished services and units we have sold and installed around San Fernando, Pampanga — plus our business credentials.")
portfolio += f"""
<section class="section section--dark" style="padding:56px 0">
  <div class="container stats">
    <div class="stat"><div class="stat__num"><b data-count="8">0</b></div><div class="stat__label">Services offered</div></div>
    <div class="stat"><div class="stat__num"><b data-count="6">0</b></div><div class="stat__label">Aircon types we handle</div></div>
    <div class="stat"><div class="stat__num"><b data-count="6">0</b><span> days</span></div><div class="stat__label">Open every week</div></div>
    <div class="stat"><div class="stat__num"><b data-count="24">0</b><span>h</span></div><div class="stat__label">Target response time</div></div>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="section-head">
      <span class="eyebrow">Finished Services &amp; Sold Products</span>
      <h2>Recent projects</h2>
      <p class="lead">A sample showcase of the jobs we do and units we supply. Tap any project to see the details.</p>
    </div>
    <div class="filters" data-filter-group="#gallery" aria-label="Filter projects">
      <button class="chip is-active" type="button" data-filter="all" aria-pressed="true">All Work</button>
      <button class="chip" type="button" data-filter="install" aria-pressed="false">Installations</button>
      <button class="chip" type="button" data-filter="cleaning" aria-pressed="false">Cleaning &amp; Repair</button>
      <button class="chip" type="button" data-filter="product" aria-pressed="false">Sold Products</button>
      <button class="chip" type="button" data-filter="commercial" aria-pressed="false">Commercial</button>
    </div>
    <div class="gallery" id="gallery">
{chr(10).join(work(w) for w in WORKS)}
    </div>
  </div>
</section>

<section class="section section--alt">
  <div class="container">
    <div class="section-head">
      <span class="eyebrow">Tools for You</span>
      <h2>Quick quote &amp; availability</h2>
      <p class="lead">Get an instant price range for your job and check if we're open right now.</p>
    </div>
    <div class="widgets">
      <div class="widget reveal" id="estimator">
        <div class="widget__head"><h3>Instant Quote Estimator</h3><span class="tag">Free</span></div>
        <div class="estimator">
          <div class="estimator__row">
            <div class="field"><label for="est-service">Service</label>
              <select id="est-service"><option value="cleaning">Cleaning / Chemical wash</option><option value="repair">Repair &amp; troubleshooting</option><option value="installation">Installation (labor)</option><option value="freon">Freon recharge</option></select></div>
            <div class="field"><label for="est-type">Aircon type</label>
              <select id="est-type"><option value="window">Window-type</option><option value="split" selected>Split-type</option><option value="cassette">Ceiling cassette</option><option value="floor">Floor-standing</option></select></div>
          </div>
          <div class="field"><label for="est-qty">Number of units</label>
            <div class="qty"><button type="button" data-step="-1" aria-label="Fewer units">−</button><input id="est-qty" type="number" min="1" max="20" value="1" inputmode="numeric"><button type="button" data-step="1" aria-label="More units">+</button></div></div>
          <div class="estimator__result" aria-live="polite">
            <small>Estimated cost</small>
            <div class="estimator__total" id="est-total">₱0</div>
            <p class="estimator__note"><span id="est-disc" hidden><strong style="color:#1E8E4E">10% multi-unit discount applied.</strong> </span>Indicative range only — final price after a free assessment.</p>
          </div>
          <a class="btn btn--primary" href="contact.html">Book This Service {I['arrow']}</a>
        </div>
      </div>
      <div class="widget reveal reveal-delay-1">
        <div class="widget__head"><h3>Opening Hours</h3><span class="live" data-open-status>Open now</span></div>
        <ul class="hours" data-hours></ul>
        <p class="form__note" style="margin-top:14px">Philippine Time (GMT+8). Emergency calls answered when available.</p>
        <a class="btn btn--ghost" style="margin-top:16px;width:100%" href="tel:{PHONE_TEL}">{I['phone']} Call {PHONE_DISPLAY}</a>
      </div>
    </div>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="section-head">
      <span class="eyebrow">Business Credentials</span>
      <h2>Registered, trained and accountable</h2>
      <p class="lead">We are completing our local business registrations. Reference numbers will be posted here once issued — ask us anytime for copies.</p>
    </div>
    <div class="grid grid--3">
      <div class="card cred reveal"><span class="icon">{I['file']}</span><div><h3>DTI Business Name Registration</h3><p>Theo's Airconditioning Services</p><span class="cred__status cred__status--pending">Reg. no. to be posted</span></div></div>
      <div class="card cred reveal reveal-delay-1"><span class="icon icon--cyan">{I['building']}</span><div><h3>Mayor's / Business Permit</h3><p>City of San Fernando, Pampanga</p><span class="cred__status cred__status--pending">Permit no. to be posted</span></div></div>
      <div class="card cred reveal reveal-delay-2"><span class="icon icon--warm">{I['file']}</span><div><h3>BIR Certificate of Registration</h3><p>Official receipts available on request</p><span class="cred__status cred__status--pending">TIN to be posted</span></div></div>
      <div class="card cred reveal"><span class="icon">{I['award']}</span><div><h3>TESDA RAC Servicing NC II</h3><p>Refrigeration &amp; Air-conditioning servicing skills</p><span class="cred__status cred__status--pending">Certificate details to be posted</span></div></div>
      <div class="card cred reveal reveal-delay-1"><span class="icon icon--cyan">{I['shield']}</span><div><h3>Service Warranty</h3><p>Written warranty on workmanship for every job</p><span class="cred__status">Included</span></div></div>
      <div class="card cred reveal reveal-delay-2"><span class="icon icon--warm">{I['star']}</span><div><h3>Free Assessment</h3><p>No-obligation site check and itemized quote</p><span class="cred__status">Always</span></div></div>
    </div>
  </div>
</section>

<div class="lightbox" role="dialog" aria-modal="true" aria-label="Project details">
  <div class="lightbox__inner">
    <button class="lightbox__close" type="button" aria-label="Close">×</button>
    <img src="" alt="">
    <div class="lightbox__caption"><h3></h3><p></p></div>
  </div>
</div>
"""
portfolio += footer()

# ------------------------------------------------------------------ CONTACT
SERVICE_OPTS = ["Cleaning", "Repair", "Installation", "Freon Recharge", "Heating", "Ventilation", "Maintenance (PMS)", "Buy a Unit"]
picks = "\n".join(
    f'            <div class="pick"><input type="checkbox" id="svc-{i}" name="service" value="{s}"><label for="svc-{i}">{s}</label></div>'
    for i, s in enumerate(SERVICE_OPTS))

contact = head("Contact Us | Book Aircon Service in San Fernando, Pampanga — Theo's",
               "Book aircon cleaning, repair or installation in San Fernando, Pampanga. Call 0975 650 1762 or email theoacservices2026@gmail.com.", "contact")
contact += header()
contact += "<main id=\"main\">\n" + page_hero("Contact Us", "Contact Us", "Let's get your space<br>cool again.",
    "Send us your request and we'll reply with a schedule and quote — usually within the day.")
contact += f"""
<section class="section">
  <div class="container contact-grid">
    <div class="widget reveal">
      <div class="widget__head"><h3>Request a Service</h3><span class="tag">Free quote</span></div>
      <form class="form" id="contact-form" novalidate>
        <div class="field"><label for="name">Full name <span class="req">*</span></label>
          <input id="name" name="name" type="text" autocomplete="name" placeholder="Juan Dela Cruz" required><span class="field__error"></span></div>
        <div class="field"><label for="address">Address <span class="req">*</span></label>
          <input id="address" name="address" type="text" autocomplete="street-address" placeholder="House no., street, barangay, San Fernando" required><span class="field__error"></span></div>
        <div class="form__row">
          <div class="field"><label for="phone">Contact number <span class="req">*</span></label>
            <input id="phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="09XX XXX XXXX" required><span class="field__error"></span></div>
          <div class="field"><label for="email">Email <span class="req">*</span></label>
            <input id="email" name="email" type="email" autocomplete="email" placeholder="you@email.com" required><span class="field__error"></span></div>
        </div>
        <fieldset class="field service-field" style="border:0;padding:0;margin:0">
          <legend style="font-size:.88rem;font-weight:700;color:var(--navy);margin-bottom:7px">Service needed <span class="req" style="color:var(--blue)">*</span></legend>
          <div class="service-picks">
{picks}
          </div>
          <span class="field__error"></span>
        </fieldset>
        <div class="form__row">
          <div class="field"><label for="units">Number of units</label>
            <select id="units" name="units"><option>1</option><option>2</option><option>3</option><option>4</option><option>5+</option></select></div>
          <div class="field"><label for="schedule">Preferred date</label>
            <input id="schedule" name="schedule" type="date"></div>
        </div>
        <div class="field"><label for="message">Details (optional)</label>
          <textarea id="message" name="message" placeholder="Aircon brand, HP, type, and what's wrong — e.g. 'Split-type 1.5 HP, not cooling, dripping water.'"></textarea></div>
        <div class="form-status" role="status" aria-live="polite"></div>
        <button class="btn btn--primary" type="submit" style="justify-self:start">Send Request {I['arrow']}</button>
        <p class="form__note">By sending, you agree to be contacted by Theo's Airconditioning Services about your request. We never share your details.</p>
      </form>
    </div>

    <div style="display:grid;gap:24px">
      <div class="widget reveal reveal-delay-1">
        <h3 style="margin-bottom:20px">Contact details</h3>
        <div class="info-list">
          <div class="info-item"><span class="icon">{I['phone']}</span><div><small>Call / Text</small><a href="tel:{PHONE_TEL}">{PHONE_DISPLAY}</a></div></div>
          <div class="info-item"><span class="icon icon--warm">{I['mail']}</span><div><small>Gmail</small><a href="mailto:{EMAIL}">{EMAIL}</a></div></div>
          <div class="info-item"><span class="icon icon--cyan">{I['pin']}</span><div><small>Location</small><span>San Fernando, Pampanga, Philippines</span></div></div>
          <div class="info-item"><span class="icon">{I['user']}</span><div><small>Owner</small><span>Theo</span></div></div>
        </div>
        <div class="socials" style="margin-top:22px">
          <a href="{FB}" target="_blank" rel="noopener" aria-label="Facebook" style="background:var(--navy)">{I['fb']}</a>
          <a href="{IG}" target="_blank" rel="noopener" aria-label="Instagram" style="background:var(--navy)">{I['ig']}</a>
          <a href="{TT}" target="_blank" rel="noopener" aria-label="TikTok" style="background:var(--navy)">{I['tt']}</a>
          <a href="{MESSENGER}" target="_blank" rel="noopener" aria-label="Messenger" style="background:var(--navy)">{I['msg']}</a>
        </div>
      </div>
      <div class="widget reveal reveal-delay-2">
        <div class="widget__head"><h3>Opening Hours</h3><span class="live" data-open-status>Open now</span></div>
        <ul class="hours" data-hours></ul>
      </div>
    </div>
  </div>
</section>

<section class="section" style="padding-top:0">
  <div class="container">
    <div class="map reveal">
      <iframe title="Map of San Fernando, Pampanga" src="https://www.google.com/maps?q=City+of+San+Fernando,+Pampanga,+Philippines&amp;z=13&amp;output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>
    </div>
    <p class="form__note" style="margin-top:12px">Service area: City of San Fernando and nearby towns — Angeles, Bacolor, Mexico, Sta. Ana, Guagua and more. <a style="color:var(--blue);font-weight:600" href="https://maps.google.com/?q=San+Fernando,+Pampanga" target="_blank" rel="noopener">Open in Google Maps →</a></p>
  </div>
</section>
"""
contact += footer()

for name, html in [("index.html", home), ("about.html", about), ("services.html", services),
                   ("portfolio.html", portfolio), ("contact.html", contact)]:
    (OUT / name).write_text(html, encoding="utf-8")
    print("wrote", name, len(html))
