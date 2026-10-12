"use strict";

// Shared knowledge for the Graphic Designer AI: the SOP workflow, the Kam Team brand kit,
// the AI tool guide and the starter templates. The browser loads it from /api/catalog
// and the AI assistant gets the same facts in its instructions, so both always agree.

/* ---------------- SOP: every design moves through these stages ---------------- */
const SOP = [
  {
    id: "brief", name: "Brief", goal: "Agree on what the design must do before anyone designs it.",
    checklist: [
      { id: "goal", label: "Goal written (what should the viewer do?)" },
      { id: "audience", label: "Audience and channel chosen" },
      { id: "message", label: "Key message and call to action written" },
      { id: "size", label: "Canvas size matches the channel" },
    ],
  },
  {
    id: "create", name: "Create", goal: "Build the design from a template, with AI help where it saves time.",
    checklist: [
      { id: "template", label: "Started from a template or approved layout" },
      { id: "copy", label: "Headline and copy final, spelled correctly" },
      { id: "imagery", label: "Imagery added (own photo, licensed stock, or AI-generated)" },
      { id: "logo", label: "Kam Team logo placed" },
    ],
  },
  {
    id: "review", name: "Review", goal: "Check brand, legibility and compliance before anything goes out.",
    checklist: [
      { id: "brand", label: "Brand check passes (colors, fonts, logo)" },
      { id: "contrast", label: "Text is readable (contrast and size)" },
      { id: "compliance", label: "Compliance: license/DRE #, brokerage name, Equal Housing where required" },
      { id: "rights", label: "Image rights confirmed (no AI images of real people or homes passed off as real)" },
    ],
  },
  {
    id: "approve", name: "Approve", goal: "A second person signs off.",
    checklist: [
      { id: "approver", label: "Approver named" },
      { id: "feedback", label: "Feedback resolved" },
    ],
  },
  {
    id: "export", name: "Export", goal: "Download in the right format and file it.",
    checklist: [
      { id: "format", label: "Right format: PNG for social, PDF for print, SVG for web/vector" },
      { id: "named", label: "File named: channel_campaign_date" },
      { id: "filed", label: "Source (.kamdesign.json) saved with the export" },
    ],
  },
];

/* ---------------- Brand kit ---------------- */
const BRAND = {
  name: "Kam Team",
  colors: [
    { name: "Kam Black", hex: "#111111" },
    { name: "White", hex: "#FFFFFF" },
    { name: "Bone", hex: "#F2F2F0" },
    { name: "Graphite", hex: "#2C2C2C" },
    { name: "Stone", hex: "#9C9C98" },
    { name: "Slate", hex: "#62625E" },
  ],
  fonts: { primary: "Archivo", secondary: "Inter" },
  rules: [
    "Monochrome first: Kam Black and White carry every design; greys are for support text and dividers.",
    "Archivo for headlines (bold, wide, letter-spaced uppercase works best); Inter for body copy.",
    "The chevron mark is never stretched, recolored outside black/white, or placed on busy photos without a solid backing.",
    "Leave at least 6% of the canvas width as margin on every side.",
    "One message per design. One call to action.",
  ],
};

const FONTS = ["Archivo", "Inter", "Playfair Display", "Montserrat", "Bebas Neue", "DM Serif Display", "Space Grotesk"];

/* ---------------- AI tool guide ---------------- */
// Practical, vendor-neutral notes. Licensing changes often, so every entry tells people to
// check the vendor's current terms before commercial use.
const AI_TOOLS = [
  {
    id: "claude", name: "Claude (built in)", vendor: "Anthropic", category: "Copy, layout & review",
    bestFor: "Writing headlines and captions, building layouts on the canvas, brand and compliance review, prompt writing for image tools.",
    strengths: ["Acts on your canvas: adds, edits and arranges elements", "Reads your design (snapshot) and critiques it", "Writes prompts tuned for each image tool"],
    watchOuts: ["Doesn't paint photos itself; it draws simple vector illustrations or calls the connected image generator"],
    promptTip: "Give it the goal, audience and channel: \"Instagram post announcing an open house Saturday 1-4pm at 12 Oak St, warm and premium.\"",
    url: "https://www.anthropic.com/claude",
  },
  {
    id: "gpt-image", name: "GPT Image (ChatGPT / OpenAI API)", vendor: "OpenAI", category: "Image generation",
    bestFor: "Photoreal lifestyle and interior scenes, edits from a reference image, images that need short legible text.",
    strengths: ["Follows detailed instructions well", "Good at short text inside images", "Can be connected to this app (OPENAI_API_KEY)"],
    watchOuts: ["Never present AI interiors or exteriors as the actual listing", "Check the current usage policy for commercial use"],
    promptTip: "Describe subject, setting, light, camera and mood: \"Bright modern kitchen, white oak cabinets, morning light, wide angle, editorial real estate photo.\"",
    url: "https://openai.com",
  },
  {
    id: "midjourney", name: "Midjourney", vendor: "Midjourney", category: "Image generation",
    bestFor: "High-end mood imagery, lifestyle backgrounds, campaign concepts.",
    strengths: ["Strong aesthetics and lighting", "Style references (--sref) keep a campaign consistent", "Aspect ratios via --ar"],
    watchOuts: ["Paid plan needed for commercial use; Pro/Mega for stealth mode", "Text in images is unreliable; add text in the app instead"],
    promptTip: "Add parameters at the end: \"... editorial photo, soft dusk light --ar 4:5 --style raw --v 7\".",
    url: "https://www.midjourney.com",
  },
  {
    id: "firefly", name: "Adobe Firefly", vendor: "Adobe", category: "Image generation",
    bestFor: "Enterprise-safe imagery and Generative Fill/Expand on photos you own.",
    strengths: ["Trained on licensed and public-domain content", "Content Credentials attached to outputs", "Integrated in Photoshop and Express"],
    watchOuts: ["Enterprise IP indemnification depends on your Adobe plan; confirm with your admin"],
    promptTip: "Use the content-type and style controls (Photo vs Art) and keep prompts concrete and visual.",
    url: "https://firefly.adobe.com",
  },
  {
    id: "ideogram", name: "Ideogram", vendor: "Ideogram", category: "Text in images",
    bestFor: "Posters and graphics where the typography is part of the image.",
    strengths: ["Best-in-class rendered text", "Magic Prompt expands short ideas", "Style presets for design looks"],
    watchOuts: ["Free images are public by default; use a paid plan for private generation"],
    promptTip: "Put the exact words in quotes: 'Minimal poster, bold sans serif text \"OPEN HOUSE\", black and white.'",
    url: "https://ideogram.ai",
  },
  {
    id: "recraft", name: "Recraft", vendor: "Recraft", category: "Vector & brand",
    bestFor: "Vector icons, illustrations and brand-consistent sets you can export as SVG.",
    strengths: ["True vector (SVG) output", "Brand color palettes and style locking", "Mockups and icon sets"],
    watchOuts: ["Check plan terms for commercial rights and ownership"],
    promptTip: "Ask for a set: \"Line icon set, 2px stroke, black, house / key / calendar / phone.\"",
    url: "https://www.recraft.ai",
  },
  {
    id: "flux", name: "FLUX (Black Forest Labs)", vendor: "Black Forest Labs", category: "Image generation",
    bestFor: "Photoreal images via API or self-hosted pipelines; fast iteration.",
    strengths: ["Excellent prompt adherence and realism", "Available through many APIs and tools", "Some variants can run on your own hardware"],
    watchOuts: ["License differs by variant (some are non-commercial); check before use"],
    promptTip: "Write natural sentences, front-load the subject, then style and light.",
    url: "https://blackforestlabs.ai",
  },
  {
    id: "gemini-image", name: "Gemini image models", vendor: "Google", category: "Image editing",
    bestFor: "Conversational edits: change a sky, stage an empty room, keep a person consistent across shots.",
    strengths: ["Multi-turn edits on an uploaded photo", "Keeps subjects consistent", "SynthID watermarking"],
    watchOuts: ["Virtual staging must be disclosed as such on listings"],
    promptTip: "Upload the photo, then one change at a time: \"Replace the grey sky with a soft blue sky, keep everything else identical.\"",
    url: "https://gemini.google.com",
  },
  {
    id: "canva", name: "Canva Magic Studio", vendor: "Canva", category: "Design platforms",
    bestFor: "Team templates, quick resizes (Magic Switch), brand kits shared with agents.",
    strengths: ["Huge template library", "Brand kit controls for teams", "Magic Write / Magic Edit / background remover"],
    watchOuts: ["Some AI features are limited by plan and per-month credits"],
    promptTip: "Bring finished copy from the app assistant and paste it into a Canva brand template.",
    url: "https://www.canva.com",
  },
  {
    id: "photoshop", name: "Photoshop Generative Fill", vendor: "Adobe", category: "Image editing",
    bestFor: "Removing clutter, extending backgrounds, retouching listing photos you own.",
    strengths: ["Precise, selection-based edits", "Non-destructive layers", "Generative Expand for new aspect ratios"],
    watchOuts: ["Don't remove permanent defects or add features a property doesn't have (MLS rules)"],
    promptTip: "Select the area first; leave the prompt empty to simply remove an object.",
    url: "https://www.adobe.com/products/photoshop.html",
  },
  {
    id: "upscale", name: "Upscalers (Topaz, Magnific)", vendor: "Topaz Labs / Magnific", category: "Upscaling",
    bestFor: "Making small or AI images sharp enough for print flyers and signs.",
    strengths: ["2x-6x enlargement", "Face and detail recovery", "Print-ready output"],
    watchOuts: ["Creative upscalers can invent details; use a faithful mode for real property photos"],
    promptTip: "Upscale before placing images in a print template (flyers need ~300 DPI).",
    url: "https://www.topazlabs.com",
  },
  {
    id: "bg-remove", name: "Background removal (remove.bg, Photoroom)", vendor: "Kaleido / Photoroom", category: "Image editing",
    bestFor: "Agent headshots and product cut-outs on clean brand backgrounds.",
    strengths: ["One-click cut-outs", "Batch processing", "Transparent PNG output"],
    watchOuts: ["Check hair and glasses edges at 100% zoom"],
    promptTip: "Export transparent PNG, then upload it to the app and place it on a Kam Black panel.",
    url: "https://www.remove.bg",
  },
  {
    id: "video", name: "Video & motion (Runway, Higgsfield, Veo)", vendor: "Various", category: "Video & motion",
    bestFor: "Turning a finished graphic or listing photo into a short Reel or Story.",
    strengths: ["Image-to-video with camera moves", "Short social clips in minutes", "Text-to-video concepts"],
    watchOuts: ["Motion can warp architecture; review every frame before posting", "Disclose AI-generated video where required"],
    promptTip: "Export your design as PNG, then prompt a single slow camera move: \"slow push-in, subtle parallax.\"",
    url: "https://runwayml.com",
  },
];

/* ---------------- Templates ---------------- */
// Elements use canvas pixels. Image elements with an empty src render as a photo placeholder.
let seq = 0;
const id = () => "t" + (++seq).toString(36);
const text = (t, x, y, w, h, o = {}) => ({ id: id(), type: "text", x, y, w, h, text: t, fontFamily: "Archivo", fontSize: 48, fontWeight: 700, color: "#FFFFFF", align: "left", lineHeight: 1.15, letterSpacing: 0, uppercase: false, ...o });
const rect = (x, y, w, h, o = {}) => ({ id: id(), type: "rect", x, y, w, h, fill: "#111111", radius: 0, stroke: "", strokeWidth: 0, ...o });
const photo = (x, y, w, h, o = {}) => ({ id: id(), type: "image", x, y, w, h, src: "", fit: "cover", radius: 0, name: "Photo", ...o });
const logo = (x, y, h, color = "#FFFFFF") => ({ id: id(), type: "logo", x, y, w: Math.round(h * 0.681), h, color, name: "Kam Team mark" });
const line = (x, y, w, o = {}) => rect(x, y, w, 4, { fill: "#FFFFFF", name: "Rule", ...o });

const T = {
  justListed() {
    return [
      photo(0, 0, 1080, 720),
      rect(0, 720, 1080, 360),
      logo(72, 790, 64),
      text("KAM TEAM", 128, 806, 400, 40, { fontSize: 26, fontWeight: 800, letterSpacing: 6 }),
      text("JUST LISTED", 72, 880, 936, 90, { fontSize: 84, fontWeight: 800, letterSpacing: 4 }),
      text("1234 Ocean View Dr · 4 bd · 3 ba · 2,450 sq ft", 72, 980, 936, 40, { fontFamily: "Inter", fontSize: 30, fontWeight: 400, color: "#9C9C98" }),
      rect(744, 650, 264, 70, { fill: "#FFFFFF", name: "Price tag" }),
      text("$1,250,000", 744, 666, 264, 40, { fontSize: 34, fontWeight: 800, color: "#111111", align: "center" }),
    ];
  },
  openHouse() {
    return [
      rect(0, 0, 1080, 1350, { fill: "#F2F2F0", name: "Background" }),
      photo(60, 60, 960, 760),
      text("OPEN HOUSE", 60, 870, 960, 110, { fontSize: 110, fontWeight: 800, color: "#111111", letterSpacing: 2 }),
      line(60, 995, 120, { fill: "#111111" }),
      text("SATURDAY · 1 – 4 PM", 60, 1030, 960, 50, { fontSize: 44, fontWeight: 700, color: "#111111", letterSpacing: 3 }),
      text("1234 Ocean View Dr, San Diego", 60, 1095, 960, 44, { fontFamily: "Inter", fontSize: 34, fontWeight: 400, color: "#62625E" }),
      logo(60, 1200, 80, "#111111"),
      text("KAM TEAM\nReal Estate", 130, 1206, 500, 70, { fontSize: 28, fontWeight: 800, color: "#111111", letterSpacing: 4, lineHeight: 1.25 }),
      text("DRE #00000000", 640, 1236, 380, 36, { fontFamily: "Inter", fontSize: 24, fontWeight: 400, color: "#62625E", align: "right" }),
    ];
  },
  story() {
    return [
      photo(0, 0, 1080, 1920),
      rect(0, 1180, 1080, 740, { fill: "#111111", opacity: 0.92, name: "Panel" }),
      text("NEW LISTING", 90, 1260, 900, 120, { fontSize: 112, fontWeight: 800, letterSpacing: 3 }),
      text("Modern coastal home with ocean views, a chef's kitchen and a private yard.", 90, 1410, 900, 170, { fontFamily: "Inter", fontSize: 44, fontWeight: 400, color: "#F2F2F0", lineHeight: 1.3 }),
      rect(90, 1640, 420, 100, { fill: "#FFFFFF", radius: 50, name: "Button" }),
      text("TOUR THIS HOME", 90, 1672, 420, 40, { fontSize: 34, fontWeight: 800, color: "#111111", align: "center", letterSpacing: 2 }),
      logo(930, 1650, 82),
    ];
  },
  justSold() {
    return [
      rect(0, 0, 1080, 1080, { name: "Background" }),
      photo(90, 90, 900, 600, { radius: 8 }),
      rect(90, 620, 300, 70, { fill: "#FFFFFF" }),
      text("SOLD", 90, 634, 300, 44, { fontSize: 40, fontWeight: 800, color: "#111111", align: "center", letterSpacing: 8 }),
      text("ANOTHER ONE\nCLOSED", 90, 740, 900, 180, { fontSize: 80, fontWeight: 800, lineHeight: 1.05 }),
      text("Congratulations to our sellers on Maple Ave!", 90, 940, 760, 40, { fontFamily: "Inter", fontSize: 30, fontWeight: 400, color: "#9C9C98" }),
      logo(946, 930, 64),
    ];
  },
  fbCover() {
    return [
      rect(0, 0, 1640, 624, { name: "Background" }),
      photo(980, 0, 660, 624),
      logo(120, 170, 120),
      text("KAM TEAM", 230, 190, 700, 70, { fontSize: 64, fontWeight: 800, letterSpacing: 12 }),
      text("Your home. Our mission.", 230, 280, 700, 50, { fontFamily: "Inter", fontSize: 40, fontWeight: 400, color: "#9C9C98" }),
      line(230, 360, 140),
      text("(555) 010-0000 · kam-team.com", 230, 390, 700, 40, { fontFamily: "Inter", fontSize: 30, fontWeight: 400 }),
    ];
  },
  linkedin() {
    return [
      rect(0, 0, 1584, 396, { name: "Background" }),
      text("HELPING FAMILIES BUY & SELL WITH CONFIDENCE", 520, 130, 980, 60, { fontSize: 44, fontWeight: 800, letterSpacing: 3 }),
      text("Kam Team · Real Estate · San Diego County", 520, 210, 980, 40, { fontFamily: "Inter", fontSize: 30, fontWeight: 400, color: "#9C9C98" }),
      logo(1430, 140, 100),
    ];
  },
  flyer() {
    return [
      rect(0, 0, 2550, 3300, { fill: "#FFFFFF", name: "Background" }),
      rect(0, 0, 2550, 420, { name: "Header" }),
      logo(150, 110, 200),
      text("KAM TEAM", 330, 150, 1200, 130, { fontSize: 120, fontWeight: 800, letterSpacing: 24 }),
      text("FOR SALE", 1650, 160, 750, 110, { fontSize: 110, fontWeight: 800, align: "right", letterSpacing: 6 }),
      photo(150, 540, 2250, 1400),
      photo(150, 1990, 1100, 620),
      photo(1300, 1990, 1100, 620),
      text("1234 Ocean View Dr, San Diego, CA", 150, 2680, 2250, 120, { fontSize: 100, fontWeight: 800, color: "#111111" }),
      text("4 Bedrooms · 3 Baths · 2,450 sq ft · Offered at $1,250,000", 150, 2820, 2250, 80, { fontFamily: "Inter", fontSize: 64, fontWeight: 400, color: "#62625E" }),
      rect(0, 3000, 2550, 300, { name: "Footer" }),
      text("Agent Name · (555) 010-0000 · agent@kam-team.com · DRE #00000000", 150, 3115, 2250, 70, { fontFamily: "Inter", fontSize: 54, fontWeight: 400 }),
    ];
  },
  businessCard() {
    return [
      rect(0, 0, 1050, 600, { name: "Background" }),
      logo(80, 80, 110),
      text("AGENT NAME", 80, 300, 890, 70, { fontSize: 60, fontWeight: 800, letterSpacing: 4 }),
      text("REALTOR® · DRE #00000000", 80, 380, 890, 36, { fontFamily: "Inter", fontSize: 28, fontWeight: 400, color: "#9C9C98" }),
      line(80, 440, 80),
      text("(555) 010-0000\nagent@kam-team.com", 80, 470, 890, 90, { fontFamily: "Inter", fontSize: 30, fontWeight: 400, lineHeight: 1.4 }),
      text("KAM TEAM", 600, 100, 370, 40, { fontSize: 30, fontWeight: 800, letterSpacing: 8, align: "right" }),
    ];
  },
  ytThumb() {
    return [
      photo(0, 0, 1280, 720),
      rect(0, 0, 700, 720, { opacity: 0.9, name: "Panel" }),
      text("5 MISTAKES\nSELLERS MAKE", 60, 180, 620, 280, { fontSize: 100, fontWeight: 800, lineHeight: 1.0 }),
      text("(and how to avoid them)", 60, 480, 620, 50, { fontFamily: "Inter", fontSize: 40, fontWeight: 400, color: "#9C9C98" }),
      logo(60, 600, 70),
    ];
  },
  emailHeader() {
    return [
      rect(0, 0, 1200, 400, { name: "Background" }),
      logo(80, 140, 120),
      text("THE MONTHLY MARKET", 200, 150, 900, 60, { fontSize: 56, fontWeight: 800, letterSpacing: 6 }),
      text("What's selling, what it's selling for, and what it means for you.", 200, 230, 900, 40, { fontFamily: "Inter", fontSize: 28, fontWeight: 400, color: "#9C9C98" }),
    ];
  },
  marketUpdate() {
    const stat = (x, n, label) => [
      text(n, x, 470, 300, 100, { fontSize: 88, fontWeight: 800, color: "#111111", align: "center" }),
      text(label, x, 580, 300, 40, { fontFamily: "Inter", fontSize: 26, fontWeight: 400, color: "#62625E", align: "center" }),
    ];
    return [
      rect(0, 0, 1080, 1080, { fill: "#F2F2F0", name: "Background" }),
      text("MARKET UPDATE", 90, 120, 900, 90, { fontSize: 80, fontWeight: 800, color: "#111111", letterSpacing: 2 }),
      text("San Diego County · October", 90, 230, 900, 44, { fontFamily: "Inter", fontSize: 34, fontWeight: 400, color: "#62625E" }),
      line(90, 310, 120, { fill: "#111111" }),
      ...stat(60, "$985K", "Median price"), ...stat(390, "21", "Days on market"), ...stat(720, "+3.2%", "Year over year"),
      rect(0, 860, 1080, 220, { name: "Footer" }),
      text("Thinking of selling? Get your home's value.", 90, 930, 760, 44, { fontFamily: "Inter", fontSize: 32, fontWeight: 600 }),
      logo(946, 920, 90),
    ];
  },
  slide() {
    return [
      rect(0, 0, 1920, 1080, { name: "Background" }),
      text("LISTING PRESENTATION", 140, 140, 1000, 40, { fontSize: 32, fontWeight: 700, color: "#9C9C98", letterSpacing: 8 }),
      text("Our plan to sell\nyour home", 140, 380, 1000, 300, { fontSize: 120, fontWeight: 800, lineHeight: 1.05 }),
      photo(1200, 0, 720, 1080),
      logo(140, 880, 90),
      text("KAM TEAM", 220, 896, 600, 50, { fontSize: 40, fontWeight: 800, letterSpacing: 10 }),
    ];
  },
};

const TEMPLATES = [
  { id: "ig-just-listed", name: "Just Listed", category: "Social media", channel: "Instagram / Facebook post", width: 1080, height: 1080, build: T.justListed, tools: ["gpt-image", "photoshop", "claude"], prompts: ["Bright modern living room, editorial real estate photo, natural light, wide angle", "Exterior of a modern coastal home at golden hour, clean lawn, editorial photo"] },
  { id: "ig-open-house", name: "Open House", category: "Social media", channel: "Instagram portrait (4:5)", width: 1080, height: 1350, build: T.openHouse, tools: ["midjourney", "firefly", "claude"], prompts: ["Welcoming front door with plants, warm afternoon light --ar 6:5 --style raw"] },
  { id: "story-new-listing", name: "New Listing Story", category: "Social media", channel: "Instagram / Facebook Story, Reels cover", width: 1080, height: 1920, build: T.story, tools: ["gpt-image", "video", "claude"], prompts: ["Vertical photo of a staircase in a modern home, soft light, 9:16"] },
  { id: "ig-just-sold", name: "Just Sold", category: "Social media", channel: "Instagram / Facebook post", width: 1080, height: 1080, build: T.justSold, tools: ["claude", "bg-remove"], prompts: ["Happy couple holding house keys, candid, natural light (use your real client photo with permission)"] },
  { id: "market-update", name: "Market Update", category: "Social media", channel: "Instagram / LinkedIn post", width: 1080, height: 1080, build: T.marketUpdate, tools: ["claude", "recraft"], prompts: ["Minimal line icons for price, calendar and trend arrow, 2px stroke, black"] },
  { id: "fb-cover", name: "Facebook Cover", category: "Profiles & banners", channel: "Facebook page cover", width: 1640, height: 624, build: T.fbCover, tools: ["midjourney", "firefly"], prompts: ["Aerial view of a coastal neighborhood at sunset, soft haze --ar 21:20"] },
  { id: "linkedin-banner", name: "LinkedIn Banner", category: "Profiles & banners", channel: "LinkedIn profile banner", width: 1584, height: 396, build: T.linkedin, tools: ["claude", "recraft"], prompts: [] },
  { id: "email-header", name: "Newsletter Header", category: "Email & web", channel: "Email newsletter header", width: 1200, height: 400, build: T.emailHeader, tools: ["claude"], prompts: [] },
  { id: "yt-thumbnail", name: "YouTube Thumbnail", category: "Email & web", channel: "YouTube thumbnail", width: 1280, height: 720, build: T.ytThumb, tools: ["gpt-image", "ideogram", "claude"], prompts: ["Worried homeowner looking at a SOLD sign, cinematic, shallow depth of field"] },
  { id: "flyer-letter", name: "Listing Flyer", category: "Print", channel: "US Letter flyer, 300 DPI", width: 2550, height: 3300, build: T.flyer, tools: ["upscale", "photoshop", "claude"], prompts: [] },
  { id: "business-card", name: "Business Card", category: "Print", channel: "3.5 × 2 in card, 300 DPI", width: 1050, height: 600, build: T.businessCard, tools: ["claude"], prompts: [] },
  { id: "presentation", name: "Presentation Slide", category: "Presentations", channel: "16:9 slide", width: 1920, height: 1080, build: T.slide, tools: ["claude", "gpt-image"], prompts: ["Sunlit modern dining room, editorial interior photo, vertical crop"] },
];

const SIZES = [
  { name: "Instagram post", width: 1080, height: 1080 },
  { name: "Instagram portrait", width: 1080, height: 1350 },
  { name: "Story / Reel", width: 1080, height: 1920 },
  { name: "Facebook cover", width: 1640, height: 624 },
  { name: "LinkedIn banner", width: 1584, height: 396 },
  { name: "YouTube thumbnail", width: 1280, height: 720 },
  { name: "Presentation 16:9", width: 1920, height: 1080 },
  { name: "Letter flyer (300 DPI)", width: 2550, height: 3300 },
];

function templateElements(tid) {
  const t = TEMPLATES.find(x => x.id === tid);
  if (!t) return null;
  seq = 0;
  return { width: t.width, height: t.height, elements: t.build() };
}

// What the browser gets: templates with their elements pre-built.
function publicCatalog() {
  return {
    sop: SOP, brand: BRAND, fonts: FONTS, tools: AI_TOOLS, sizes: SIZES,
    templates: TEMPLATES.map(({ build, ...t }) => ({ ...t, elements: templateElements(t.id).elements })),
  };
}

// Compact plain-text version for the AI assistant's instructions.
function knowledgeText() {
  const sop = SOP.map((s, i) => `${i + 1}. ${s.name} (${s.id}): ${s.goal} Checklist: ${s.checklist.map(c => `${c.id} = ${c.label}`).join("; ")}.`).join("\n");
  const tools = AI_TOOLS.map(t => `- ${t.name} [${t.id}] (${t.category}): best for ${t.bestFor} Watch out: ${t.watchOuts.join(" ")} Tip: ${t.promptTip}`).join("\n");
  const templates = TEMPLATES.map(t => `- ${t.id}: ${t.name}, ${t.channel}, ${t.width}x${t.height}`).join("\n");
  return `SOP stages:\n${sop}\n\nBrand kit: colors ${BRAND.colors.map(c => `${c.name} ${c.hex}`).join(", ")}. Fonts: ${BRAND.fonts.primary} (headlines), ${BRAND.fonts.secondary} (body). Other available fonts: ${FONTS.join(", ")}.\nRules:\n${BRAND.rules.map(r => "- " + r).join("\n")}\n\nTemplates:\n${templates}\n\nAI tool guide:\n${tools}`;
}

module.exports = { SOP, BRAND, FONTS, AI_TOOLS, TEMPLATES, SIZES, templateElements, publicCatalog, knowledgeText };
