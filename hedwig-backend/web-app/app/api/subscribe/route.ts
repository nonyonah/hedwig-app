import { NextRequest, NextResponse } from 'next/server';

const RESEND_AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID;

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ success: false, error: 'Invalid email' }, { status: 400 });
    }

    // Store in Resend audience if configured
    if (RESEND_AUDIENCE_ID) {
      const apiKey = process.env.RESEND_API_KEY;
      if (apiKey) {
        await fetch('https://api.resend.com/audiences/' + RESEND_AUDIENCE_ID + '/contacts', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, unsubscribed: false }),
        }).catch(() => {});
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 });
  }
}
