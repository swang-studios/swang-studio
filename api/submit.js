// /api/submit — in-house submission collector for swang.studio
// -----------------------------------------------------------------------------
// Every form on the site POSTs here. The submission is:
//   1. validated server-side,
//   2. written to Vercel function logs (visible in Vercel → Logs),
//   3. relayed to one or more of the wired delivery paths (in order):
//        a) Gmail SMTP via Nodemailer  — set GMAIL_USER + GMAIL_APP_PASSWORD
//        b) Resend API                 — set RESEND_API_KEY
//        c) FormSubmit relay (no-auth) — set FORMSUBMIT_TARGET or default below
//
// The FormSubmit path is the zero-setup default — works with no env vars.
// FIRST POST to a new address triggers a one-time confirmation email to that
// address; click the "Confirm" link in it and all subsequent POSTs deliver.
// -----------------------------------------------------------------------------

import nodemailer from 'nodemailer';

// Default relay target. Override with FORMSUBMIT_TARGET env var.
const DEFAULT_FORMSUBMIT_TARGET = 'mason.ogservices@gmail.com';

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

  let delivery = 'logs-only';
  let deliveryError = null;

  // ---- Path A: Gmail SMTP via Nodemailer -------------------------------------
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
        to: process.env.SUBMIT_TO || process.env.GMAIL_USER,
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

  // ---- Path B: Resend API ----------------------------------------------------
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
          to: [process.env.SUBMIT_TO || 'hello@swang.studio'],
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

  // ---- Path C: FormSubmit (zero-auth relay, default) -------------------------
  // FormSubmit accepts POST form-data or JSON to https://formsubmit.co/<email>.
  // Using /ajax/<email> returns JSON instead of a redirect. No signup needed.
  if (delivery === 'logs-only') {
    const target = (process.env.FORMSUBMIT_TARGET || DEFAULT_FORMSUBMIT_TARGET).trim();
    if (target) {
      try {
        const r = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(target)}`, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            _subject: subject,
            _template: 'table',
            _replyto: email || undefined,
            _captcha: 'false',
            Name: name || '(anonymous)',
            Email: email || '(none)',
            Page: page || '/',
            Source: source,
            SubmittedAt: submittedAt,
            Message: message,
          }),
        });
        if (r.ok) {
          delivery = 'formsubmit';
        } else {
          const t = await r.text();
          deliveryError = `formsubmit: ${r.status} ${t.slice(0, 200)}`;
          console.warn('[swang.studio submission] formsubmit failed', r.status, t);
        }
      } catch (err) {
        deliveryError = `formsubmit: ${err && err.message ? err.message : String(err)}`;
        console.warn('[swang.studio submission] formsubmit threw', deliveryError);
      }
    }
  }

  console.log('[swang.studio submission] delivery=' + delivery + (deliveryError ? ' lastError=' + deliveryError : ''));

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
