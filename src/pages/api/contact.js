// src/pages/api/contact.js
import { env } from 'cloudflare:workers';

export const prerender = false;

export async function POST({ request }) {
  try {
    const body = await request.json();
    const { name, email, phone, product, message, turnstileToken, lang } = body;
    const en = lang === 'en';

    if (!name || !email) {
      return new Response(JSON.stringify({ error: en ? 'Name and email are required.' : 'İsim ve e-posta zorunludur.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      return new Response(JSON.stringify({ error: en ? 'Please enter a valid email address.' : 'Geçerli bir e-posta adresi girin.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const turnstileRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: env.TURNSTILE_SECRET_KEY,
        response: turnstileToken,
        remoteip: request.headers.get('CF-Connecting-IP') || undefined,
      }),
    });
    const turnstileData = await turnstileRes.json();
    if (!turnstileData.success) {
      console.error('Turnstile doğrulaması başarısız:', turnstileData['error-codes']);
      return new Response(JSON.stringify({ error: en ? 'Verification failed. Please try again.' : 'Doğrulama başarısız oldu. Lütfen tekrar deneyin.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const htmlBody = `
      <h2>Yeni Web Sitesi Talebi${en ? ' (EN site)' : ''}</h2>
      <p><strong>İsim Soyisim:</strong> ${escapeHtml(name)}</p>
      <p><strong>E-posta:</strong> ${escapeHtml(email)}</p>
      <p><strong>Telefon:</strong> ${escapeHtml(phone || '—')}</p>
      <p><strong>İlgili Ürün:</strong> ${escapeHtml(product || '—')}</p>
      <p><strong>Mesaj:</strong></p>
      <p>${escapeHtml(message || '—').replace(/\n/g, '<br>')}</p>
    `;

    // Resend API ile e-posta gönderimi. RESEND_API_KEY Cloudflare Worker ortam değişkeni (secret) olarak eklenmeli
    // (cont.superpress.com.tr için aldığın API key).
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Superpress Web Sitesi <web@cont.superpress.com.tr>',
        to: ['info@superpress.com.tr'],
        reply_to: email,
        subject: `Yeni Talep: ${name}${product ? ' — ' + product : ''}`,
        html: htmlBody,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error('Resend error:', errText);
      return new Response(JSON.stringify({ error: en ? 'Something went wrong while sending your message. Please try again.' : 'E-posta gönderilirken bir sorun oluştu. Lütfen tekrar deneyin.' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Contact form error:', err);
    return new Response(JSON.stringify({ error: err instanceof SyntaxError ? 'Invalid request.' : 'Beklenmeyen bir hata oluştu. / An unexpected error occurred.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
