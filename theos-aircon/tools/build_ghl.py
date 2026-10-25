"""Packs the Theo's site into one self-contained HTML snippet for a GoHighLevel Custom JS/HTML element."""
import pathlib, re

SITE = pathlib.Path(__file__).resolve().parent.parent
OUT = SITE / "ghl"
OUT.mkdir(exist_ok=True)

# Reuse the page builder without letting it write files.
src = pathlib.Path(__file__).with_name("build_pages.py").read_text()
src = src[:src.index("for name, html in [")]
ns = {"__file__": str(pathlib.Path(__file__).with_name("build_pages.py"))}
exec(src, ns)

HEADER, FOOTER = ns["header"](), ns["footer"]()
MAIN_OPEN = '<main id="main">\n'

def body_of(html):
    start = html.index(HEADER) + len(HEADER)
    start = html.index(MAIN_OPEN, start) + len(MAIN_OPEN)
    return html[start:html.index(FOOTER)]

PAGES = [("home", ns["home"]), ("about", ns["about"]), ("services", ns["services"]),
         ("portfolio", ns["portfolio"]), ("contact", ns["contact"])]

def fix_links(html):
    html = re.sub(r'href="contact\.html\?service=([^"]+)"', r'href="#contact" data-service="\1"', html)
    html = html.replace('href="index.html#products"', 'href="#products"')
    html = re.sub(r'href="(?:index|about|services|portfolio|contact)\.html#([\w-]+)"', r'href="#\1"', html)
    html = html.replace('href="index.html"', 'href="#home"')
    html = re.sub(r'href="(about|services|portfolio|contact)\.html"', r'href="#\1"', html)
    # Images are inlined by the script from the IMAGES map below.
    html = re.sub(r'src="assets/img/([\w-]+)\.svg"', r'data-img="\1"', html)
    html = html.replace(' id="main"', "")
    assert ".html" not in html, re.findall(r'[\w-]+\.html[^"]*', html)
    return html

# CTA band + footer + floating button, minus </main> and the external script.
cta, rest = FOOTER.split("</main>")
rest = rest[:rest.index('<script src=')]

pages = "\n".join(
    f'<div class="page{" is-current" if pid == "home" else ""}" id="{pid}" data-route="{pid}">\n{body_of(html)}</div>'
    for pid, html in PAGES)
markup = fix_links(f'{HEADER}<main class="site-main">\n{pages}\n{cta}</main>\n{rest}')

# ---------------------------------------------------------------- CSS: scope everything to #theo-site
ROOT = "#theo-site"

def scope_selector(sel):
    sel = sel.strip()
    if sel in (":root", "html", "body"):
        return ROOT
    if sel.startswith(".nav-open"):
        return ROOT + sel
    return f"{ROOT} {sel}"

def scope(css):
    out, i = [], 0
    while True:
        j = css.find("{", i)
        if j == -1:
            out.append(css[i:]); break
        prelude = css[i:j].strip()
        depth, k = 1, j + 1
        while depth:
            depth += {"{": 1, "}": -1}.get(css[k], 0); k += 1
        block = css[j + 1:k - 1]
        if prelude.startswith(("@media", "@supports")):
            out.append(f"{prelude}{{{scope(block)}}}\n")
        elif prelude.startswith("@"):
            out.append(f"{prelude}{{{block}}}\n")
        else:
            sels = ", ".join(scope_selector(s) for s in prelude.split(","))
            out.append(f"{sels}{{{block}}}\n")
        i = k
    return "".join(out)

css = (SITE / "assets/css/style.css").read_text()
css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
css = scope(css)
# Fixed header (sticky breaks inside GHL's section wrappers), hidden pages, and resets against GHL's theme.
css += f"""
{ROOT} {{ position: relative; font-size: 16px; text-align: left; overflow-x: clip; }}
{ROOT} .site-header {{ position: fixed; left: 0; right: 0; top: 0; }}
{ROOT} .page {{ display: none; }}
{ROOT} .page.is-current {{ display: block; animation: theoFade .5s var(--ease); }}
{ROOT} a {{ text-decoration: none; }}
{ROOT} :is(h1, h2, h3, h4, h5, h6, p, li, span, label, small, strong, legend, input, select, textarea, button) {{ font-family: inherit; }}
{ROOT} :is(h1, h2, h3, h4, h5, h6) {{ color: inherit; }}
{ROOT} :is(.section, .section--alt, .widget, .card:not(.plan--featured)) :is(h1, h2, h3, h4) {{ color: var(--navy); }}
{ROOT} :is(.section--dark, .cta-band, .page-hero, .slide__content, .site-footer) :is(h1, h2, h3, h4) {{ color: var(--white); }}
{ROOT} .section--dark .card h3 {{ color: var(--white); }}
{ROOT} .section--cinema .section-head h2, {ROOT} .section--cinema .widget h3 {{ color: var(--white); }}
{ROOT} {{ width: 100%; }}
{ROOT} ul {{ margin-top: 0; }}
{ROOT} button {{ font-family: inherit; }}
@keyframes theoFade {{ from {{ opacity: 0; transform: translateY(10px); }} to {{ opacity: 1; transform: none; }} }}
"""
css = re.sub(r"\n\s*\n", "\n", css)

# ---------------------------------------------------------------- JS: page router + inline images + GHL webhook
js = (SITE / "assets/js/main.js").read_text()

def sub(old, new):
    global js
    assert old in js, old
    js = js.replace(old, new)

sub('const BUSINESS_EMAIL = "theoacservices2026@gmail.com";',
    'const BUSINESS_EMAIL = "theoacservices2026@gmail.com";\n'
    '  // Optional: paste a GHL Workflow "Inbound Webhook" URL here to send form leads straight into your GHL CRM.\n'
    '  const GHL_WEBHOOK_URL = "";\n'
    '  const site = document.getElementById("theo-site");\n'
    '  // Break out of the GHL section/row/column padding so the site runs edge to edge.\n'
    '  for (let el = site.parentElement; el && el !== document.body; el = el.parentElement) {\n'
    '    ["max-width", "width", "padding", "margin", "transform"].forEach((prop, i) =>\n'
    '      el.style.setProperty(prop, ["none", "100%", "0", "0", "none"][i], "important"));\n'
    '  }')
sub('const HERO_PHOTOS = ["assets/img/hero-1.jpg", "assets/img/hero-2.jpg", "assets/img/hero-3.jpg", "assets/img/hero-4.jpg", "assets/img/hero-5.jpg"];',
    '// Paste the photo links from your GHL Media Library between the quotes.\n'
    '  const HERO_PHOTOS = ["https://assets.cdn.filesafe.space/QeRTt8xtFFFgXPKx0qyt/media/6ad3ab85436f78fefb5ef77e.jpg", "https://assets.cdn.filesafe.space/QeRTt8xtFFFgXPKx0qyt/media/6ad3ab46f9a985d42cdb9530.jpg", "https://assets.cdn.filesafe.space/QeRTt8xtFFFgXPKx0qyt/media/6ad3ab513cacdd91178d05e5.jpg", "https://assets.cdn.filesafe.space/QeRTt8xtFFFgXPKx0qyt/media/6ad3ab3a989628c77a436aba.jpg", "https://assets.cdn.filesafe.space/QeRTt8xtFFFgXPKx0qyt/media/6ad3b25e3cacdd91178dde61.jpg"];')
sub('split: "",', 'split: "https://assets.cdn.filesafe.space/QeRTt8xtFFFgXPKx0qyt/media/6ad3b1a1f9a985d42cdc5032.jpg",')
sub('window: "",', 'window: "https://assets.cdn.filesafe.space/QeRTt8xtFFFgXPKx0qyt/media/6ad3b1afcd7225ed37b1ecad.jpg",')
sub('cassette: "",', 'cassette: "https://assets.cdn.filesafe.space/QeRTt8xtFFFgXPKx0qyt/media/6ad3b24b3cacdd91178ddc69.jpg",')
sub('floor: "",', 'floor: "https://assets.cdn.filesafe.space/QeRTt8xtFFFgXPKx0qyt/media/6ad3b25e3cacdd91178dde61.jpg",')
sub('const $ = (sel, root = document)', 'const $ = (sel, root = site)')
sub('const $$ = (sel, root = document)', 'const $$ = (sel, root = site)')
sub('document.body.classList.toggle("nav-open", open);',
    'site.classList.toggle("nav-open", open);\n    document.body.style.overflow = open ? "hidden" : "";')
sub('document.body.classList.contains("nav-open")', 'site.classList.contains("nav-open")')
sub('''  const page = document.body.dataset.page;
  $$(".nav__link").forEach((link) => {
    if (link.dataset.page === page) { link.classList.add("is-active"); link.setAttribute("aria-current", "page"); }
  });
''', '''  /* ---------- Pages: hash router (#home, #about, #services, #portfolio, #contact, or any section id) ---------- */
  const pages = $$(".page");
  const headerOffset = () => (header ? header.offsetHeight : 0) + 12;
  const route = (smooth) => {
    const id = decodeURIComponent(location.hash.slice(1)) || "home";
    const target = document.getElementById(id);
    const page = target && site.contains(target) ? (target.classList.contains("page") ? target : target.closest(".page")) : pages[0];
    if (!page) return;
    pages.forEach((p) => p.classList.toggle("is-current", p === page));
    $$(".nav__link").forEach((link) => {
      const active = link.dataset.page === (id === "products" ? "products" : page.id);
      link.classList.toggle("is-active", active);
      if (active) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
    });
    const y = target && target !== page ? target.getBoundingClientRect().top + window.scrollY - headerOffset() : site.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: Math.max(0, y), behavior: smooth ? "smooth" : "auto" });
  };
  window.addEventListener("hashchange", () => route(false));
  // Re-clicking the link for the current hash should still scroll.
  site.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    if (a.dataset.service) {
      $$("input[name=service]").forEach((c) => (c.checked = c.value.toLowerCase().startsWith(a.dataset.service.toLowerCase())));
    }
    if (a.getAttribute("href") === location.hash) { e.preventDefault(); route(true); }
  });
  route(false);
  // The browser's own jump-to-anchor runs after this on first load; re-apply our offset.
  window.addEventListener("load", () => route(false));
''')
sub('''    // Pre-select a service from ?service=... links.
    const pre = new URLSearchParams(location.search).get("service");
    if (pre) $$("input[name=service]", form).forEach((c) => { if (c.value.toLowerCase().startsWith(pre.toLowerCase())) c.checked = true; });
''', '')
sub('''        // FormSubmit relays the request to the business Gmail (no backend needed).
        const res = await fetch(''', '''        if (GHL_WEBHOOK_URL) {
          // GHL inbound webhooks don't send CORS headers, so post as a simple form request and assume success.
          const fields = Object.assign({}, data, { first_name: data.name.split(" ")[0], source: "Website form" });
          await fetch(GHL_WEBHOOK_URL, { method: "POST", mode: "no-cors", body: new URLSearchParams(fields) });
        }
        // FormSubmit relays the request to the business Gmail (no backend needed).
        const res = await fetch(''')
sub('document.addEventListener("click", (e) => { if (!fab.contains(e.target))',
    'document.addEventListener("click", (e) => { if (!fab.contains(e.target))')  # unchanged, sanity check

images = {}
for f in sorted((SITE / "assets/img").glob("*.svg")):
    svg = re.sub(r">\s+<", "><", f.read_text().strip())
    svg = re.sub(r"\s+", " ", svg)
    assert "`" not in svg and "${" not in svg
    images[f.stem] = svg
img_js = "  /* ---------- Inline images ---------- */\n  const IMAGES = {\n" + ",\n".join(
    f'    "{k}": `{v}`' for k, v in images.items()) + '''
  };
  $$("img[data-img]").forEach((img) => {
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(IMAGES[img.dataset.img]);
  });
'''
sub('  /* ---------- Header: scroll state', img_js + '\n  /* ---------- Header: scroll state')

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">\n'
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
         '<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">')

# Pure-ASCII output so the snippet survives any editor/charset: entities in HTML, \u escapes in JS/CSS.
markup = "".join(c if ord(c) < 128 else f"&#{ord(c)};" for c in markup)
js = "".join(c if ord(c) < 128 else f"\\u{ord(c):04x}" for c in js)
css = "".join(c if ord(c) < 128 else f"\\{ord(c):x} " for c in css)

snippet = f"""<!-- Theo's Airconditioning Services - full website for a GoHighLevel "Custom JS/HTML" element.
     Paste this whole file into ONE Custom JS/HTML element on a blank, full-width GHL page. -->
{FONTS}
<style>
{css}</style>
<div id="theo-site">
{markup}
</div>
<script>
{js}</script>
"""
assert snippet.isascii()
(OUT / "theos-website-ghl.html").write_text(snippet, encoding="utf-8")

preview = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Theo's Airconditioning Services | San Fernando, Pampanga</title>
<style>body {{ margin: 0; }}</style>
</head>
<body>
{snippet}</body>
</html>
"""
(OUT / "preview.html").write_text(preview, encoding="utf-8")
print("snippet bytes:", len(snippet.encode()))
