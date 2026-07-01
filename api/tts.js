// Briefcast — ElevenLabs text-to-speech proxy (Vercel Serverless Function)
// Uses ElevenLabs PREMADE voices, which are available on the FREE tier via the API.
// (Instant-cloned voices require a paid plan — this proxy avoids them by design.)
//
// Endpoint:  POST /api/tts   body: { "script": "...", "voice": "Rachel" }  -> audio/mpeg (MP3)
//
// Required env var:
//   ELEVENLABS_API_KEY   your ElevenLabs API key (free account is fine)
// Optional env vars:
//   ELEVENLABS_MODEL_ID  default: eleven_multilingual_v2 (use eleven_turbo_v2_5 for speed/lower cost)
//   ALLOWED_ORIGIN       lock CORS to your prototype's origin (default: * )

// Friendly name -> ElevenLabs PREMADE voice_id (all free-tier accessible).
const PREMADE = {
  Rachel:    '21m00Tcm4TlvDq8ikWAM', // US female
  Sarah:     'EXAVITQu4vr4xnSDxMaL', // US female
  Brian:     'nPczCjzI2devNBz1zQrb', // US male
  Adam:      'pNInz6obpgDQGcFmaJgB', // US male
  George:    'JBFqnCBsd6RMkjVDRZzb', // UK male
  Charlotte: 'XB0fDUnXU5powFXDhCwa', // UK female
  Daniel:    'onwK4e9ZLuTAKqWW03F9', // UK male
  Lily:      'pFZP5JQG7iQjIQuC4Bku'  // UK female
};
const DEFAULT_VOICE_ID = PREMADE.Rachel;
const MODEL_ID = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';

function looksLikeId(v) { return /^[A-Za-z0-9]{16,}$/.test(v); }

function resolveVoiceId(voice) {
  const want = (voice || '').toString().trim();
  if (!want) return DEFAULT_VOICE_ID;
  if (PREMADE[want]) return PREMADE[want];
  // case-insensitive name match
  const hit = Object.keys(PREMADE).find(n => n.toLowerCase() === want.toLowerCase());
  if (hit) return PREMADE[hit];
  // a bare premade id is fine; unknown cloned ids fall back to the default premade voice
  if (looksLikeId(want)) return want;
  return DEFAULT_VOICE_ID;
}

export default async function handler(req, res) {
  const origin = process.env.ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'Server is missing ELEVENLABS_API_KEY' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }

  const script = ((body && body.script) || '').toString().slice(0, 9000);
  if (!script.trim()) { res.status(400).json({ error: 'Missing "script" in request body' }); return; }

  const voiceId = resolveVoiceId(body && (body.voice || body.voiceId));

  try {
    const r = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + voiceId, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        text: script,
        model_id: MODEL_ID,
        voice_settings: { stability: 0.4, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true }
      })
    });

    if (!r.ok) {
      const detail = await r.text();
      res.status(r.status).json({ error: 'ElevenLabs error', detail: detail.slice(0, 600) });
      return;
    }

    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(buf);
  } catch (e) {
    res.status(502).json({ error: 'Proxy failed', detail: String(e && e.message || e) });
  }
}
