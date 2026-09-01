// Cloudflare Pages Function — handles POST /api/contact.
// Requires two environment variables set in the Cloudflare Pages dashboard
// (Settings > Environment variables), not committed to the repo:
//   RESEND_API_KEY  - API key from https://resend.com
//   CONTACT_TO      - the email address that should receive submissions
//
// Swap this out for Formspree, Basin, or any other form backend if you'd
// rather not manage an API key — just point the <form action> at their URL.

interface Env {
  RESEND_API_KEY: string;
  CONTACT_TO: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const form = await request.formData();
  const name = String(form.get('name') || '').slice(0, 200);
  const email = String(form.get('email') || '').slice(0, 200);
  const message = String(form.get('message') || '').slice(0, 5000);

  if (!name || !email || !message) {
    return new Response('Missing required fields', { status: 400 });
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Website Contact Form <contact@lingostar.ai>', // must be a verified Resend sender domain
      to: [env.CONTACT_TO],
      reply_to: email,
      subject: `New contact form message from ${name}`,
      text: `From: ${name} <${email}>\n\n${message}`,
    }),
  });

  if (!res.ok) {
    return new Response('Failed to send message', { status: 502 });
  }

  return new Response('OK', { status: 200 });
};
