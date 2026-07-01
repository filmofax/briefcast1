// Briefcast — ElevenLabs text-to-speech proxy (Vercel Serverless Function)
// Deploy this folder to Vercel. Your API key NEVER leaves the server.
//
// Endpoint:  POST /api/tts   body: { "script": "..." }   -> audio/mpeg (MP3)
//
// Required env var:
//   ELEVENLABS_API_KEY   your ElevenLabs API key
// Optional env vars:
//   ELEVENLABS_VOICE_ID  voice to use (default: Rachel, 21m00Tcm4TlvDq8ikWAM)
//   ELEVENLABS_MODEL_ID  model (default: eleven_multilingual_v2; use eleven_flash_v2_5 for speed/cost)
//   ALLOWED_ORIGIN       lock CORS to your prototype's origin (default: * )

export default async function handler(req, res) {
  const origin = process.env.ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'Server is missing ELEVENLABS_API_KEY' }); return; }

  const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // Rachel
  const MODEL_ID = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const script = ((body && body.script) || '').toString().slice(0, 9000); // safety cap (~ keeps cost bounded)
  if (!script.trim()) { res.status(400).json({ error: 'Missing "script" in request body' }); return; }

  try {
    const r = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + VOICE_ID, {
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
