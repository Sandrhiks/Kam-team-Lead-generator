"use strict";

// The AI assistant, powered by Claude. Two modes share one endpoint:
// - "design": an agent with tools that edit the open design (add/update/delete elements,
//   apply templates, generate images, run the brand check, move it through the SOP).
//   The browser sends the design; the server runs the tool loop on a copy and returns the result.
// - "support": a ChatGPT-style help and creative assistant, no tools.
//
// Replies stream as server-sent events:
//   {"t": "..."}                         text
//   {"tool": {"name", "label"}}          a tool started
//   {"toolDone": {"name", "ok", "message"}}
//   {"design": {...}}                    the updated design (design mode, only if it changed)
//   {"error": "..."} / {"done": true}

const Anthropic = require("@anthropic-ai/sdk");
const D = require("./design");
const catalog = require("./catalog");

const MAX_MESSAGES = 30;
const MAX_CHARS = 6000;
const MAX_TURNS = 14;
const MAX_SNAPSHOT = 2.5 * 1024 * 1024;

const ELEMENT_PROPS = {
  type: "object",
  description: "Element properties. Common: x, y, w, h (canvas pixels, origin top-left), rotation (degrees), opacity (0-1), name, hidden, locked. " +
    "text: text (use \\n for line breaks), fontFamily, fontSize (px), fontWeight (100-900), italic, uppercase, color (#RRGGBB), align (left|center|right), lineHeight (multiplier), letterSpacing (px). Text wraps inside w; make h fit the lines. " +
    "rect/ellipse: fill (#RRGGBB or \"\" for none), stroke, strokeWidth, radius (rect corner radius). " +
    "image: fit (cover|contain), radius. Leave src empty to make a photo placeholder. " +
    "logo: color (the Kam Team chevron mark; keep w = h * 0.681).",
  additionalProperties: true,
};

const TOOLS = [
  {
    name: "get_design",
    description: "Return the current design (canvas, brief, SOP stage and every element with its id). Call it again after big changes if you need fresh ids.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "add_element",
    description: "Add one element on top of the design. Returns its id.",
    input_schema: { type: "object", properties: { type: { type: "string", enum: D.TYPES }, props: ELEMENT_PROPS }, required: ["type", "props"], additionalProperties: false },
  },
  {
    name: "update_element",
    description: "Change some properties of an existing element. Only the properties you pass change.",
    input_schema: { type: "object", properties: { id: { type: "string" }, props: ELEMENT_PROPS }, required: ["id", "props"], additionalProperties: false },
  },
  {
    name: "delete_element",
    description: "Remove an element.",
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
  },
  {
    name: "reorder_element",
    description: "Change stacking order: front, back, forward (one step up) or backward.",
    input_schema: { type: "object", properties: { id: { type: "string" }, to: { type: "string", enum: ["front", "back", "forward", "backward"] } }, required: ["id", "to"], additionalProperties: false },
  },
  {
    name: "set_canvas",
    description: "Rename the design, change its background color, or resize the canvas. Set scale_content to true to scale existing elements with a resize.",
    input_schema: { type: "object", properties: { name: { type: "string" }, width: { type: "number" }, height: { type: "number" }, background: { type: "string" }, scale_content: { type: "boolean" } }, additionalProperties: false },
  },
  {
    name: "apply_template",
    description: "Replace the canvas size and all elements with a starter template (see the template list). Use it at the start of a new design, then customize the text.",
    input_schema: { type: "object", properties: { template_id: { type: "string" } }, required: ["template_id"], additionalProperties: false },
  },
  {
    name: "add_illustration",
    description: "Add a vector illustration, icon or pattern you draw as a complete standalone SVG document (no scripts, no external links, use a viewBox). Good for icons, simple shapes, badges and decorative graphics in brand colors.",
    input_schema: { type: "object", properties: { svg: { type: "string" }, name: { type: "string" }, x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" } }, required: ["svg", "x", "y", "w", "h"], additionalProperties: false },
  },
  {
    name: "update_brief",
    description: "Fill in the SOP brief: goal, audience, channel, message, cta, approver, notes.",
    input_schema: { type: "object", properties: Object.fromEntries(D.BRIEF_FIELDS.map(k => [k, { type: "string" }])), additionalProperties: false },
  },
  {
    name: "set_stage",
    description: "Move the design to an SOP stage and/or tick checklist items. checks keys look like \"brief.goal\" or \"review.brand\" (stage id, dot, item id); true ticks, false unticks. Only tick items that are actually done.",
    input_schema: { type: "object", properties: { stage: { type: "string", enum: D.STAGES }, checks: { type: "object", additionalProperties: { type: "boolean" } } }, additionalProperties: false },
  },
  {
    name: "brand_check",
    description: "Run the automatic Kam Team brand and legibility check. Returns a score and issues with element ids. Run it before telling the user a design is ready.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
];

const IMAGE_TOOL = {
  name: "generate_image",
  description: "Generate a photo or illustration with the connected image model and place it. Pass element_id to fill an existing image placeholder, or x/y/w/h to add a new image. Write a detailed visual prompt (subject, setting, light, camera, style); never ask for text, logos or real people.",
  input_schema: { type: "object", properties: { prompt: { type: "string" }, element_id: { type: "string" }, x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" } }, required: ["prompt"], additionalProperties: false },
};

const BASE = `You are Kam, the AI design assistant inside the Kam Team Design Studio, a web app the Kam Team (a real estate team) uses to make on-brand graphics: social posts, stories, flyers, banners, business cards, thumbnails and slides.`;

const DESIGN_PROMPT = `${BASE}

You're working inside the user's open design and you can edit it directly with tools. Act, don't just describe: when the user asks for a change, make it with tools, then say briefly what you did (one to three short sentences, or a short list). Ask a question only when you truly can't proceed.

How to work:
- The current design (as JSON) and, when available, a snapshot image of the canvas come with the user's latest message. Coordinates are canvas pixels from the top-left. Later elements draw on top.
- For a new or empty design, pick the best template with apply_template, fill in the brief with update_brief, then rewrite the template's text for the user's request. Replace placeholder text (addresses, prices, "Agent Name", "0000") with what the user gave you; if they didn't give a detail, keep a clear placeholder and tell them what to fill in. Never invent prices, addresses, license numbers or statistics.
- Follow the Kam Team brand: Kam Black #111111 and White #FFFFFF first, greys for support; Archivo for headlines, Inter for body; keep the chevron mark (logo element) unstretched; 6% margins; one message and one call to action.
- Make text fit: estimate each line at about 0.55 x fontSize x characters wide (wider for uppercase or letter-spaced text) and make h = lines x fontSize x lineHeight.
- Images: fill empty photo placeholders with generate_image when it's available. Otherwise tell the user to upload their own photo (Upload in the left panel) or use the AI Tools guide, and give a ready-to-paste prompt for the best tool. Never present AI-generated images of a property as the real listing, and never generate real people.
- Before saying a design is finished, run brand_check, fix the errors you can, and mention anything the user must fix (like empty placeholders).
- SOP: designs move Brief -> Create -> Review -> Approve -> Export. Tick checklist items with set_stage as they're truly done. Only a human can approve: never tick approve.* items or set the stage to approve or export unless the user says it's approved.
- Compliance: listing ads usually need the agent's DRE license number and the brokerage name; follow fair housing rules (describe the property, never the kind of people who should live there).

Style: friendly, short and direct. Plain language.`;

const SUPPORT_PROMPT = `${BASE}

Here you're the studio's help desk and creative partner, in a chat like ChatGPT. Help people use the studio, plan campaigns, write copy and captions, choose the right AI tool for a job, and write prompts for image and video tools. You can't edit designs from this chat; for that, they open a design and use the Assistant panel there.

How the studio works:
- Sign-in uses a one-time code sent by email (no passwords). The code lasts a few minutes; "Send a new code" gets another after 30 seconds. The account menu (top right) has Sign out and "Sign out of all devices".
- Home: start a design by describing it to the AI, pick a size, or open a recent design. Designs save to the account automatically.
- Templates: starter layouts for social posts, stories, banners, email headers, flyers, business cards and slides, each with recommended AI tools and prompt ideas.
- Editor: left panel (Add text/shapes/logo/photo upload, Layers, Brand), canvas in the middle (drag to move, corner handles to resize, arrow keys to nudge, Delete, Ctrl/Cmd+Z undo, Ctrl/Cmd+D duplicate), right panel (properties, SOP workflow with checklists and the brand check, and the AI Assistant that edits the design for you).
- Download: PNG (1x/2x), JPG, PDF, SVG, and the editable source file (.kamdesign.json), which can be imported again from Home.
- AI Tools: a guide to the AI tools the team uses, plus a Prompt Builder that formats prompts for each tool.
- Support: FAQ and support tickets that go to the team's admins.

Style: friendly, clear and practical. Use short paragraphs, lists and numbered steps. If you don't know something about the studio, say so instead of guessing, and never invent features. For account, billing or bug problems, suggest a support ticket{{SUPPORT}}.`;

/* ---------------- Input checks ---------------- */
// The model's tool input arrives already parsed; check it against the tool's schema.
function checkInput(tool, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "Tool input must be an object.";
  const s = tool.input_schema;
  for (const k of s.required || []) if (input[k] === undefined) return `Missing required field "${k}".`;
  for (const [k, v] of Object.entries(input)) {
    const p = s.properties[k];
    if (!p) return `Unknown field "${k}".`;
    const t = Array.isArray(v) ? "array" : v === null ? "null" : typeof v;
    if (p.type === "number" && t !== "number") return `"${k}" must be a number.`;
    if (p.type === "string" && t !== "string") return `"${k}" must be a string.`;
    if (p.type === "boolean" && t !== "boolean") return `"${k}" must be true or false.`;
    if (p.type === "object" && t !== "object") return `"${k}" must be an object.`;
    if (p.enum && !p.enum.includes(v)) return `"${k}" must be one of: ${p.enum.join(", ")}.`;
  }
  return null;
}

function toolLabel(name, input) {
  const labels = {
    get_design: "Reading the design", add_element: `Adding ${input.type || "element"}`, update_element: "Editing an element",
    delete_element: "Removing an element", reorder_element: "Reordering layers", set_canvas: "Updating the canvas",
    apply_template: `Applying template ${input.template_id || ""}`.trim(), add_illustration: "Drawing an illustration",
    update_brief: "Writing the brief", set_stage: "Updating the SOP checklist", brand_check: "Running the brand check",
    generate_image: "Generating an image",
  };
  return labels[name] || name;
}

/* ---------------- Factory ---------------- */
function createAgent({ apiKey, model, supportEmail, images }) {
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey });
  const knowledge = catalog.knowledgeText();
  const designSystem = `${DESIGN_PROMPT}\n\n${knowledge}`;
  const supportSystem = `${SUPPORT_PROMPT.replace("{{SUPPORT}}", supportEmail ? ` or emailing ${supportEmail}` : "")}\n\n${knowledge}`;
  const designTools = (images ? [...TOOLS, IMAGE_TOOL] : TOOLS).map(t => ({ ...t, eager_input_streaming: true }));
  const brandHex = catalog.BRAND.colors.map(c => c.hex);

  function cleanMessages(messages) {
    if (!Array.isArray(messages) || !messages.length) return "Send at least one message.";
    const out = [];
    for (const m of messages.slice(-MAX_MESSAGES)) {
      if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return "Invalid message.";
      const text = m.content.trim().slice(0, MAX_CHARS);
      if (text) out.push({ role: m.role, content: text });
    }
    while (out.length && out[0].role !== "user") out.shift();
    if (!out.length || out[out.length - 1].role !== "user") return "The last message must be from you.";
    return out;
  }

  // Runs one tool against the working copy of the design. Returns { content, isError, changed }.
  async function runTool(design, block) {
    const tool = designTools.find(t => t.name === block.name);
    if (!tool) return { content: `Unknown tool ${block.name}.`, isError: true };
    const bad = checkInput(tool, block.input);
    if (bad) return { content: bad, isError: true };
    const input = block.input;
    try {
      if (block.name === "apply_template") {
        const t = catalog.templateElements(input.template_id);
        if (!t) return { content: `No template "${input.template_id}". Use one of: ${catalog.TEMPLATES.map(x => x.id).join(", ")}.`, isError: true };
        const prefix = D.newId();
        design.width = t.width; design.height = t.height; design.templateId = input.template_id;
        design.elements = t.elements.map(e => D.cleanElement({ ...e, id: `${prefix}${e.id}` }, catalog.FONTS));
        design.background = design.elements[0] && design.elements[0].type === "rect" ? design.elements[0].fill || "#FFFFFF" : "#FFFFFF";
        return { content: JSON.stringify({ message: `Applied ${input.template_id}.`, design: D.describeForAi(design) }), changed: true };
      }
      if (block.name === "add_illustration") {
        const e = D.cleanElement({ type: "image", src: D.svgToDataUrl(input.svg), fit: "contain", name: input.name || "Illustration", x: input.x, y: input.y, w: input.w, h: input.h }, catalog.FONTS);
        design.elements.push(e);
        return { content: `Added illustration ${e.id}.`, changed: true };
      }
      if (block.name === "generate_image") {
        let target = input.element_id ? design.elements.find(e => e.id === input.element_id) : null;
        if (input.element_id && (!target || target.type !== "image")) return { content: `"${input.element_id}" isn't an image element.`, isError: true };
        const box = target || { w: input.w || design.width, h: input.h || design.height };
        const src = await images.generate(input.prompt, images.aspectFor(box.w, box.h));
        if (target) Object.assign(target, { src, prompt: input.prompt.slice(0, 1000) });
        else {
          target = D.cleanElement({ type: "image", src, prompt: input.prompt, name: "AI image", fit: "cover", x: input.x || 0, y: input.y || 0, w: box.w, h: box.h }, catalog.FONTS);
          design.elements.push(target);
        }
        return { content: `Image placed in ${target.id}. Remind the user it's AI-generated.`, changed: true };
      }
      const before = JSON.stringify(design);
      const result = D.ops[block.name](design, input, catalog.FONTS, brandHex);
      return { content: JSON.stringify(result), changed: JSON.stringify(design) !== before };
    } catch (e) {
      if (e instanceof D.DesignError || e.status) return { content: e.message, isError: true };
      throw e;
    }
  }

  async function stream(req, res, user, body) {
    const mode = body.mode === "design" ? "design" : "support";
    const messages = cleanMessages(body.messages);
    let design = null;
    if (typeof messages !== "string" && mode === "design") {
      try { design = D.cleanDesign(body.design, catalog.FONTS); } catch (e) {
        return json(res, 400, e instanceof D.DesignError ? e.message : "Invalid design.");
      }
    }
    if (typeof messages === "string") return json(res, 400, messages);

    // Attach the design (and a snapshot of the canvas) to the latest user message.
    if (mode === "design") {
      const last = messages[messages.length - 1];
      const content = [];
      const snap = typeof body.snapshot === "string" ? body.snapshot.match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/) : null;
      if (snap && body.snapshot.length <= MAX_SNAPSHOT) {
        content.push({ type: "image", source: { type: "base64", media_type: `image/${snap[1]}`, data: snap[2] } });
      }
      content.push({ type: "text", text: `<current_design>\n${JSON.stringify(D.describeForAi(design))}\n</current_design>${snap ? "\nThe image above is a snapshot of the canvas right now." : ""}` });
      content.push({ type: "text", text: last.content });
      last.content = content;
    }

    res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
    const send = obj => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(obj)}\n\n`); };

    let current = null, closed = false, changed = false;
    res.on("close", () => { if (!res.writableFinished) { closed = true; if (current) current.abort(); } });

    const system = [
      { type: "text", text: mode === "design" ? designSystem : supportSystem, cache_control: { type: "ephemeral" } },
      { type: "text", text: `The user is ${user.name || "a team member"} (${user.email}). Today is ${new Date().toDateString()}.${mode === "design" && !images ? " No image generator is connected, so generate_image isn't available." : ""}` },
    ];

    try {
      let jsonRetries = 0;
      for (let turn = 0; turn < MAX_TURNS && !closed; turn++) {
        current = client.beta.messages.stream({
          model,
          max_tokens: 32000,
          output_config: { effort: mode === "design" ? "medium" : "low" },
          // If a safety check declines the request, the API retries it on a fallback model.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system,
          ...(mode === "design" ? { tools: designTools } : {}),
          messages,
        });
        current.on("text", t => send({ t }));

        let final;
        try {
          final = await current.finalMessage();
          jsonRetries = 0;
        } catch (e) {
          // With eager input streaming, a tool input that isn't valid JSON rejects here; re-issue the turn.
          if (e instanceof Anthropic.APIError || current.aborted || jsonRetries++ >= 2) throw e;
          continue;
        }

        if (final.stop_reason === "refusal") {
          send({ t: "\n\nSorry, I can't help with that one. Try asking another way." });
          break;
        }
        const uses = final.content.filter(b => b.type === "tool_use");
        if (final.stop_reason === "max_tokens") {
          send({ t: "\n\n(I had to stop early. Ask me to continue.)" });
          break;
        }
        if (final.stop_reason !== "tool_use" || !uses.length) break;

        messages.push({ role: "assistant", content: final.content });
        const results = [];
        for (const block of uses) {
          send({ tool: { name: block.name, label: toolLabel(block.name, block.input || {}) } });
          const r = await runTool(design, block);
          if (r.changed) changed = true;
          send({ toolDone: { name: block.name, ok: !r.isError, message: r.isError ? r.content : "" } });
          results.push({ type: "tool_result", tool_use_id: block.id, content: r.content, ...(r.isError ? { is_error: true } : {}) });
        }
        messages.push({ role: "user", content: results });
        if (turn === MAX_TURNS - 1) send({ t: "\n\n(That was a lot of steps, so I paused here. Tell me to keep going.)" });
      }
      if (changed) send({ design: { ...design, updated: Date.now() } });
      send({ done: true });
    } catch (e) {
      if (closed) return;
      let error = "The assistant isn't available right now. Try again in a minute.";
      if (e instanceof Anthropic.RateLimitError) error = "The assistant is busy right now. Try again in a minute.";
      else if (e instanceof Anthropic.AuthenticationError) error = "The assistant isn't set up correctly. Ask your admin to check ANTHROPIC_API_KEY.";
      console.warn("Assistant error:", e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e.message);
      if (changed) send({ design: { ...design, updated: Date.now() } });
      send({ error });
    }
    res.end();
  }

  return { stream, model };
}

function json(res, status, error) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ ok: false, error }));
}

module.exports = { createAgent, TOOLS, IMAGE_TOOL, checkInput, DESIGN_PROMPT, SUPPORT_PROMPT };
