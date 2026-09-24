// api/plan.js
// Builds a real, sequenced itinerary with Gemini, then saves the traveller's
// email + the whole trip into Supabase so you can see what people plan.
// Keys are read from Vercel env vars only.

const MODEL = "gemini-2.5-flash-lite";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "GEMINI_API_KEY not set in Vercel" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }

  const {
    destination = "", days = 2, party = "Friends", budget = "Mid-range",
    pace = "Balanced", interests = [], notes = "", places = [], email = "",
  } = body;

  if (!destination) return res.status(400).json({ error: "Destination is required" });
  if (!places.length) return res.status(400).json({ error: "No places selected" });

  const placeList = places.map(p => `- ${p.name} (${p.category || ""}${p.area ? ", " + p.area : ""})`).join("\n");

  const prompt = `You are an expert travel consultant planning a ${days}-day trip to ${destination}.

Traveller profile:
- Travelling with: ${party}
- Budget: ${budget}
- Pace: ${pace}
- Into: ${interests.join(", ") || "a bit of everything"}
- Extra notes: ${notes || "none"}

Places they want to include:
${placeList}

Build a realistic day-by-day itinerary that:
- Groups places by geography so there is minimal back-and-forth across the city.
- Respects a ${pace.toLowerCase()} pace (do NOT overstuff days).
- Orders stops sensibly by time of day (markets/temples earlier, nightlife later, sunset spots at sunset).
- Gives a realistic time and a short, SPECIFIC reason each stop fits THIS traveller ("why for you").
- Flags ONE risk or smart improvement for the whole trip (an overloaded day, a missed sunset, a better order).

Return ONLY valid JSON, no markdown, exactly:
{"title":"short trip title",
 "days":[{"day":1,"theme":"","stops":[{"time":"09:00","name":"","area":"","why":"","travelToNext":"~15 min by transit"}]}],
 "review":{"verdict":"one line: is this a good plan?","fix":"the single most useful improvement"}}`;

  let itinerary = null;
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.5, responseMimeType: "application/json" },
        }),
      }
    );
    if (!r.ok) {
      const t = await r.text();
      return res.status(502).json({ error: "Gemini error", detail: t.slice(0, 400) });
    }
    const data = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    try { itinerary = JSON.parse(text); }
    catch { itinerary = JSON.parse(text.replace(/```json|```/g, "").trim()); }
  } catch (e) {
    return res.status(500).json({ error: "Server error building plan", detail: String(e).slice(0, 300) });
  }

  // Save to Supabase (best-effort — never block the traveller if it fails).
  let saved = false, saveError = null;
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (url && secret) {
    try {
      const s = await fetch(`${url}/rest/v1/trips`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: secret,
          Authorization: `Bearer ${secret}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          email: email || null,
          destination,
          days,
          party,
          budget,
          pace,
          interests,
          notes,
          trip: itinerary, // full itinerary JSON stored in a jsonb column
        }),
      });
      saved = s.ok;
      if (!s.ok) saveError = (await s.text()).slice(0, 300);
    } catch (e) {
      saveError = String(e).slice(0, 300);
    }
  }

  return res.status(200).json({ itinerary, saved, saveError });
}
