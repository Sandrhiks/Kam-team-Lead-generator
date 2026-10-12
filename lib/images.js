"use strict";

// Optional AI image generation. Claude writes and edits designs but doesn't paint photos,
// so photo generation goes to a separate image model. Today that's OpenAI's Images API
// (set OPENAI_API_KEY; IMAGE_MODEL defaults to gpt-image-1). Without a key the app still
// works: the assistant writes prompts you can paste into Midjourney, Firefly, Ideogram, etc.

const SIZES = { square: "1024x1024", landscape: "1536x1024", portrait: "1024x1536" };

function createImages({ apiKey, model = "gpt-image-1", baseUrl = "https://api.openai.com/v1" }) {
  if (!apiKey) return null;

  // Returns a data URL (PNG). Throws an Error with a user-facing message on failure.
  async function generate(prompt, aspect = "square") {
    const clean = String(prompt || "").trim().slice(0, 4000);
    if (clean.length < 3) throw Object.assign(new Error("Describe the image you want."), { status: 400 });
    const r = await fetch(`${baseUrl}/images/generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: clean, size: SIZES[aspect] || SIZES.square, n: 1 }),
      signal: AbortSignal.timeout(120000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.warn("Image generation failed:", r.status, j.error && j.error.message);
      const policy = r.status === 400 && /safety|policy|moderation/i.test((j.error && j.error.message) || "");
      throw Object.assign(new Error(policy
        ? "The image generator declined that prompt. Try describing it differently."
        : "The image generator isn't available right now. Try again in a minute."), { status: 502 });
    }
    const b64 = j.data && j.data[0] && j.data[0].b64_json;
    if (!b64) throw Object.assign(new Error("The image generator returned no image."), { status: 502 });
    return "data:image/png;base64," + b64;
  }

  // Closest supported aspect for a w x h box.
  function aspectFor(w, h) {
    const r = w / h;
    return r > 1.2 ? "landscape" : r < 0.83 ? "portrait" : "square";
  }

  return { generate, aspectFor, model };
}

module.exports = { createImages };
