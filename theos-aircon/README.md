# Theo's Airconditioning Services — Website

Static 5-page website (HTML/CSS/JS, no build step) for Theo's Airconditioning Services, San Fernando, Pampanga.

| Page | File | Contents |
| --- | --- | --- |
| Home | `index.html` | Hero slideshow (5 aircon scenes), trust strip, filterable **Products**, services overview, how-it-works |
| About | `about.html` | Story & timeline, owner profile (Theo, May 2026, 0975 650 1762, theoacservices2026@gmail.com), values, team |
| Services | `services.html` | Cleaning, Heating, Ventilation, Air Conditioning + maintenance plans |
| Portfolio | `portfolio.html` | Filterable project gallery with lightbox, quote-estimator widget, live "open now" hours widget, business credentials |
| Contact | `contact.html` | Request form (name, address, contact number, email, service needed), contact details, opening hours, Google Map |

Every page has the sticky header (logo left, links right, "Book a Service" button, hamburger menu on mobile), the footer with contact details and social links, and a floating quick-contact button.

## Run locally

```
cd theos-aircon
python3 -m http.server 8080   # then open http://localhost:8080
```

You can also upload the folder as-is to any static host (Netlify, Vercel, GitHub Pages, Hostinger).

## Before going live

- **Contact form:** requests are sent to `theoacservices2026@gmail.com` through [FormSubmit](https://formsubmit.co) (no server needed). The **first** submission sends a one-time activation email to that Gmail; click the link in it to turn the form on. If the request can't be sent, the visitor's email app opens with the details already filled in.
- **Social links:** change the `FB`, `IG`, `TT` and `MESSENGER` URLs (they currently point to the platform home pages).
- **Credentials:** add the DTI, Mayor's Permit, BIR and TESDA numbers in `portfolio.html` once they're issued.
- **Photos:** the slides, portfolio and product images are custom SVG illustrations in `assets/img/`. Replace them with real job photos when you have them (keep the same file names, or update the `src` attributes).
- **Prices & hours:** the prices are sample figures. Opening hours are set in the `HOURS` constant in `assets/js/main.js`; also update the hours shown in the footer.

## GoHighLevel (GHL) version

`ghl/theos-website-ghl.html` is the whole 5-page website in **one self-contained file**: all styles, scripts and images are inside it, with no outside files. Its menu switches between Home, About, Services, Portfolio and Contact without leaving the page.

**To add it to GHL:**
1. In GHL, go to **Sites → Websites (or Funnels) → New → From blank**, and create one page (e.g. "Home", path `/`).
2. In the page builder, add a **Full Width** section, delete its default rows/padding if you like, and drag in the **Custom JS/HTML** (Code) element.
3. Open the element, click **Code Editor**, paste the **entire** contents of `ghl/theos-website-ghl.html`, and save.
4. Set the page's SEO title/description in **Page Settings → SEO Meta Data**, then **Publish** and connect your domain.

You can see it in a browser first by opening `ghl/preview.html`, which is the same code wrapped in a normal web page.

**Sending form leads into GHL (optional):** create a GHL Workflow with the **Inbound Webhook** trigger, copy its URL, and paste it into `GHL_WEBHOOK_URL = ""` near the top of the `<script>` in the GHL file. Each form submission then reaches that workflow (name, first_name, email, phone, address, service, units, schedule, message). Use **Create/Update Contact** and an internal notification action to save the lead and alert you. Send one test submission and confirm the fields arrive in the workflow before going live. The email copy through FormSubmit still goes to theoacservices2026@gmail.com either way.

**Making changes:** edit the multi-page source, then run `python3 tools/build_pages.py && python3 tools/build_ghl.py` to regenerate both versions.
