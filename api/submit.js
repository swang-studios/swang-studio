// /api/submit — in-house submission collector for swang.studio
// -----------------------------------------------------------------------------
// Every form on the site (Leave a Review, Work With Me, Let's Talk) POSTs here.
// No mailto redirects. No third-party UI. The submission:
//   1. is validated server-side,
//   2. gets written to Vercel function logs (visible in Vercel → Logs),
//   3. is emailed to hello@swang.studio via one of the wired delivery paths:
//        a) Gmail SMTP  — primary. Set GMAIL_USER + GMAIL_APP_PASSWORD.
//        b) Resend API  — fallback.  Set RESEND_API_KEY.
//      If neither is configured the submission is still captured in logs.
//
// To enable Gmail (Google Workspace) delivery:
//   1. Turn on 2-Step Verification for the sending account.
//   2. Visit https://myaccount.google.com/apppasswords — create one for "swang site form".
//   3. In Vercel → Project → Settings → Environment Variables (Production):
//        GMAIL_USER         = hello@swang.studio   (or whichever Workspace inbox)
//        GMAIL_APP_PASSWORD = <16-char app password, no spaces>
//        SUBMIT_TO          = hello@swang.studio   (optional, defaults to GMAIL_USER)
//   4. Redeploy (next push does it automatically).
// -----------------------------------------------------------------------------

import nodemailer from 'nodemailer';

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

  // Always write a structured log line — greppable in Vercel → Logs.
  console.log('[swang.studio submission]', JSON.stringify(record));

  const subject = `swang.studio — ${source} (${name || 'anonymous'})`;
  const html = renderHtml({ submittedAt, name, email, message, source, page });
  const text = renderText({ submittedAt, name, email, message, source, page });
  const to   = process.env.SUBMIT_TO || process.env.GMAIL_USER || 'hello@swang.studio';

  let delivery = 'logs-only';
  let deliveryError = null;

  // ---- Primary path: Gmail SMTP via Nodemailer -------------------------------
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    try {
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD,
        },
      });
      await transporter.sendMail({
        from: `"swang.studio" <${process.env.GMAIL_USER}>`,
        to,
        replyTo: email || undefined,
        subject,
        text,
        html,
      });
      delivery = 'gmail';
    } catch (err) {
      deliveryError = `gmail: ${err && err.message ? err.message : String(err)}`;
      console.warn('[swang.studio submission] gmail send failed:', deliveryError);
    }
  }

  // ---- Fallback path: Resend API --------------------------------------------
  if (delivery === 'logs-only' && process.env.RESEND_API_KEY) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.SUBMIT_FROM || 'swang.studio <onboarding@resend.dev>',
          to: [to],
          reply_to: email || undefined,
          subject,
          html,
        }),
      });
      if (r.ok) {
        delivery = 'resend';
      } else {
        const t = await r.text();
        deliveryError = `resend: ${r.status} ${t}`;
        console.warn('[swang.studio submission] resend failed', r.status, t);
      }
    } catch (err) {
      deliveryError = `resend: ${err && err.message ? err.message : String(err)}`;
      console.warn('[swang.studio submission] resend threw', deliveryError);
    }
  }

  console.log('[swang.studio submission] delivery=' + delivery + (deliveryError ? ' lastError=' + deliveryError : ''));

  // The site UI only cares that the submission was accepted. Don't leak env
  // errors to the browser. Log is enough for debugging.
  return res.status(200).json({ ok: true });
}

function renderHtml({ submittedAt, name, email, message, source, page }) {
  return `
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
}

function renderText({ submittedAt, name, email, message, source, page }) {
  return [
    `New submission — ${source}`,
    submittedAt,
    '',
    `Name:  ${name || '(anonymous)'}`,
    `Email: ${email || '(none)'}`,
    `Page:  ${page || '/'}`,
    '',
    message,
  ].join('\n');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
