// Cloudflare Worker entry point. The Cloudflare project this repo deploys to
// is a Workers service (git-integrated "Workers Builds", running
// `wrangler deploy`) — not the older separate "Pages" product — so static
// assets are served via the `ASSETS` binding (see wrangler.toml's [assets]
// block) and this script only has to handle the one dynamic route.
//
// Requires two environment variables set in the Cloudflare dashboard
// (Workers & Pages > lingostar > Settings > Variables and Secrets), not
// committed to the repo:
//   RESEND_API_KEY  - API key from https://resend.com
//   CONTACT_TO      - the email address that should receive submissions

export interface Env {
  ASSETS: Fetcher;
  RESEND_API_KEY: string;
  CONTACT_TO: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/contact' && request.method === 'POST') {
      return handleContact(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};

async function handleContact(request: Request, env: Env): Promise<Response> {
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
}
