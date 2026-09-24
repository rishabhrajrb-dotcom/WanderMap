// api/extract.js
// Vercel serverless function. Two ways in:
//   1) User pastes a YouTube link  -> we hand the URL to Gemini as a video part,
//      Gemini watches it and pulls out the real places mentioned/shown.
//   2) User pastes text/notes/caption -> Gemini extracts places from the text.
// All keys live in Vercel env vars; the browser never sees them.

const MODEL = "gemini-2.5-flash-lite";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// Pull any YouTube URL out of whatever the user pasted.
function findYouTubeUrl(text) {
  const m = text.match(
    /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=[\w-]+|youtu\.be\/[\w-]+|youtube\.com\/shorts\/[\w-]+)[^\s]*/i
  );
  return m ? m[0] : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "GEMINI_API_KEY not set in Vercel" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const destination = (body.destination || "").trim();
  const source = (body.source || "").trim();
  if (!destination) return res.status(400).json({ error: "Destination is required" });

  const youtubeUrl = findYouTubeUrl(source);

  // The instruction is the same whether the input is a video or text; only the
  // parts differ. Asking for strict JSON keeps parsing reliable.
  const instruction = `You are an expert local travel guide for ${destination}.
${youtubeUrl
  ? `Watch the linked travel video. Identify every real, specific, named place in ${destination} that it shows or mentions (restaurants, cafes, temples, markets, viewpoints, neighbourhoods, attractions).`
  : `From the traveller's notes below, identify the real, specific, named places in ${destination} they point to.`}

${youtubeUrl ? "" : `Notes:\n"""\n${source || "(none — suggest the essentials)"}\n"""\n`}
Rules:
- Only real, currently-operating places actually in ${destination}. Never invent one. Drop anything not in ${destination}.
- Correct partial or misheard names to the full real name.
- After listing what's in the source, add 2-3 strong extra suggestions the traveller likely missed, including at least one lesser-known "hidden gem".
- 6 to 9 places total.

Return ONLY valid JSON, no markdown, exactly:
{"places":[{"name":"","category":"one of: Food, Culture, Nightlife, Shopping, Nature, Hidden gem, Viewpoint, Market","area":"neighbourhood or district","why":"one short sentence on why it fits or why it's worth it","fromNotes":true}]}
Set fromNotes to false for the extra ones you added that were not in the source.`;

  const parts = [];
  if (youtubeUrl) {
    parts.push({ file_data: { file_uri: youtubeUrl } }); // Gemini watches the video
  }
  parts.push({ text: instruction });

  try {
    const r = await fetch(`${ENDPOINT}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.6, responseMimeType: "application/json" },
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      // Common: 400 if the video is private/unlisted, 429 if daily video quota hit.
      let hint = "";
      if (r.status === 429) hint = " (Gemini free-tier video limit — try text, or wait.)";
      if (r.status === 400 && youtubeUrl) hint = " (Video must be public, not private/unlisted.)";
      return res.status(502).json({ error: "Gemini error" + hint, detail: t.slice(0, 400) });
    }

    const data = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    let parsed;
    try { parsed = JSON.parse(text); }
    catch { parsed = JSON.parse(text.replace(/```json|```/g, "").trim()); }

    const places = Array.isArray(parsed.places) ? parsed.places.slice(0, 9) : [];
    return res.status(200).json({ destination, source: youtubeUrl ? "youtube" : "text", places });
  } catch (e) {
    return res.status(500).json({ error: "Server error", detail: String(e).slice(0, 300) });
  }
}
