// Briefcast — FREE natural text-to-speech proxy (Vercel Serverless Function)
//
// Uses Amazon Polly neural/standard voices via the free StreamElements speech API.
// NO API KEY REQUIRED. No account, no billing, no ElevenLabs subscription.
//
// Endpoint:  POST /api/tts   body: { "script": "...", "voice": "Brian" }  -> audio/mpeg (MP3)
//
// Voices (pass one as "voice"; default Brian):
//   UK:  Brian (m), Amy (f), Emma (f)
//   US:  Matthew (m), Joey (m), Joanna (f), Salli (f), Kimberly (f), Kendra (f), Justin (m), Ivy (f)
//   AU:  Russell (m), Nicole (f)
//   IN:  Raveena (f)   Welsh-En: Geraint (m)
//
// Optional env var:
//   ALLOWED_ORIGIN   lock CORS to your prototype's origin (default: * )

const VOICES = new Set([
  'Brian','Amy','Emma','Matthew','Joey','Joanna','Salli','Kimberly','Kendra',
  'Justin','Ivy','Russell','Nicole','Raveena','Geraint'
]);
const DEFAULT_VOICE = 'Brian';
const MAX_CHUNK = 280; // StreamElements caps text length per request

// Split a long script into <=MAX_CHUNK pieces at sentence, then word, boundaries.
function chunkText(text, max) {
  const sentences = text.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]*/g) || [text];
  const out = [];
  let cur = '';
  const push = (s) => { if (s && s.trim()) out.push(s.trim()); };
  for (let s of sentences) {
    s = s.trim();
    if (!s) continue;
    if (s.length > max) {
      // Hard-split an over-long sentence by words.
      if (cur) { push(cur); cur = ''; }
      let w = '';
      for (const word of s.split(' ')) {
        if ((w + ' ' + word).trim().length > max) { push(w); w = word; }
        else { w = (w + ' ' + word).trim(); }
      }
      if (w) cur = w;
      continue;
    }
    if ((cur + ' ' + s).trim().length <= max) cur = (cur + ' ' + s).trim();
    else { push(cur); cur = s; }
  }
  push(cur);
  return out;
}

async function speak(chunk, voice) {
  const url = 'https://api.streamelements.com/kappa/v2/speech?voice=' +
    encodeURIComponent(voice) + '&text=' + encodeURIComponent(chunk);
  let lastErr = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Briefcast/1.0)',
          'Accept': 'audio/mpeg,*/*'
        }
      });
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      if (r.ok && /audio|mpeg|octet/.test(ct)) {
        return Buffer.from(await r.arrayBuffer());
      }
      lastErr = 'HTTP ' + r.status + ' ' + (await r.text()).slice(0, 160);
    } catch (e) { lastErr = String(e && e.message || e); }
  }
  throw new Error(lastErr || 'speech request failed');
}

export default async function handler(req, res) {
  const origin = process.env.ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }

  const script = ((body && body.script) || '').toString().slice(0, 9000);
  if (!script.trim()) { res.status(400).json({ error: 'Missing "script" in request body' }); return; }

  let voice = ((body && (body.voice || body.voiceId)) || DEFAULT_VOICE).toString().trim();
  if (!VOICES.has(voice)) voice = DEFAULT_VOICE; // ignore old ElevenLabs IDs / unknown names

  try {
    const chunks = chunkText(script, MAX_CHUNK);
    const parts = [];
    for (const c of chunks) {
      parts.push(await speak(c, voice));
    }
    const audio = Buffer.concat(parts);
    if (!audio.length) throw new Error('No audio produced');
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(audio);
  } catch (e) {
    res.status(502).json({ error: 'TTS proxy failed', detail: String(e && e.message || e).slice(0, 300) });
  }
}
