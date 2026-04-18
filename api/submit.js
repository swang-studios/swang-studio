// /api/submit — in-house submission collector for swang.studio
// -----------------------------------------------------------------------------
// Every form on the site (Leave a Review, Work With Me, Let's Talk) POSTs here.
// No mailto redirects. No third-party redirect. The submission:
//   1. is validated server-side,
//   2. gets written to Vercel function logs (visible in the Vercel dashboard),
//   3. is emailed to hello@swang.studio if RESEND_API_KEY is set in env.
//
// To enable email delivery:
//   1. Create a free Resend account at https://resend.com
//   2. Vercel → Project → Settings → Environment Variables → add RESEND_API_KEY
//   3. Redeploy. Emails start flowing. Submissions keep getting logged either way.
// -----------------------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Vercel parses JSON automatically when Content-Type is application/json.
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const name    = String(body.name    || '').trim().slice(0, 200);
  const email   = String(body.email   || '').trim().slice(0, 200);
  const message = String(body.message || '').trim().slice(0, 5000);
  const source  = String(body.source  || 'site').trim().slice(0, 80);
  const page    = String(body.page    || '').trim().slice(0, 200);

  if (!message) {
    return res.status(400).json({ ok: false, error: 'Message required' });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'Bad email' });
  }

  const submittedAt = new Date().toISOString();
  const record = { submittedAt, name, email, message, source, page };

  // Tally: structured log line that's easy to grep in Vercel → Logs.
  console.log('[swang.studio submission]', JSON.stringify(record));

  // Optional: email via Resend if the key is set.
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const subject = `swang.studio — ${source} (${name || 'anonymous'})`;
      const html = `
        <div style="font-family:system-ui,-apple-system,sans-serif;color:#1c2416;max-width:560px;">
          <h2 style="margin:0 0 12px;color:#3d5229;">New submission — ${escapeHtml(source)}</h2>
          <p style="margin:0 0 4px;color:#666;font-size:12px;">${submittedAt}</p>
          <table style="margin-top:16px;border-collapse:collapse;width:100%;">
            <tr><td style="padding:6px 0;color:#888;width:90px;">Name</td><td>${escapeHtml(name) || '<em>anonymous</em>'}</td></tr>
            <tr><td style="padding:6px 0;color:#888;">Email</td><td>${escapeHtml(email) || '<em>none</em>'}</td></tr>
            <tr><td style="padding:6px 0;color:#888;">Page</td><td>${escapeHtml(page) || '/'}</td></tr>
          </table>
          <div style="margin-top:16px;padding:16px;background:#f4f1ec;border-left:3px solid #5c7a42;white-space:pre-wrap;line-height:1.6;">${escapeHtml(message)}</div>
        </div>`;
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.SUBMIT_FROM || 'swang.studio <onboarding@resend.dev>',
          to: [process.env.SUBMIT_TO || 'hello@swang.studio'],
          reply_to: email || undefined,
          subject,
          html,
        }),
      });
      if (!r.ok) {
        const t = await r.text();
        console.warn('[swang.studio submission] resend failed', r.status, t);
      }
    } catch (err) {
      console.warn('[swang.studio submission] resend threw', err);
    }
  }

  return res.status(200).json({ ok: true });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
