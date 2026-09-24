/**
 * Vercel Serverless Function: POST /api/waitlist
 * Validates email and forwards waitlist signups to Discord webhook.
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

module.exports = async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse request body if needed
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: 'Invalid email' });
      }
    }

    const email = (body && body.email ? String(body.email).trim().toLowerCase() : '');

    // Validate email presence and format
    if (!email || !EMAIL_REGEX.test(email) || email.length > 254) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl || webhookUrl.trim() === '') {
      console.error('DISCORD_WEBHOOK_URL environment variable is missing.');
      return res.status(500).json({ error: 'Something went wrong' });
    }

    // Construct Discord rich embed payload
    const payload = {
      username: 'Logbook Archivist',
      embeds: [
        {
          title: '📋 New Waitlist Registration',
          color: 16102830, // #f5b5ae (Peach Coral)
          description: 'A new prospective member registered for early access.',
          fields: [
            {
              name: 'Email Address',
              value: `\`${email}\``,
              inline: false
            },
            {
              name: 'Timestamp',
              value: new Date().toUTCString(),
              inline: true
            },
            {
              name: 'Source',
              value: 'Logbook Landing Page',
              inline: true
            }
          ],
          footer: {
            text: 'Logbook Index System'
          }
        }
      ]
    };

    const discordRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!discordRes.ok) {
      console.error(`Discord webhook responded with HTTP ${discordRes.status}`);
      return res.status(500).json({ error: 'Something went wrong' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Waitlist submission handler error:', err.message);
    return res.status(500).json({ error: 'Something went wrong' });
  }
};
