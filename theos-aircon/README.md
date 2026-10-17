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
