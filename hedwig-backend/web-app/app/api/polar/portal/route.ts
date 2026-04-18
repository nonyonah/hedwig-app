import { NextRequest, NextResponse } from 'next/server';
import { Polar } from '@polar-sh/sdk';
import { resolvePolarPortalReturnUrl, resolvePolarServer } from '@/lib/billing/polar';

const polarAccessToken = String(process.env.POLAR_ACCESS_TOKEN || '').trim();

export async function GET(req: NextRequest): Promise<Response> {
  if (!polarAccessToken) {
    return NextResponse.json(
      { success: false, error: 'POLAR_ACCESS_TOKEN is not configured.' },
      { status: 503 }
    );
  }

  const externalCustomerId = req.nextUrl.searchParams.get('customerExternalId')?.trim() || '';
  const customerId = req.nextUrl.searchParams.get('customerId')?.trim() || '';

  if (!externalCustomerId && !customerId) {
    return NextResponse.json(
      { success: false, error: 'Missing customer identifier for portal session.' },
      { status: 400 }
    );
  }

  try {
    const polar = new Polar({
      accessToken: polarAccessToken,
      server: resolvePolarServer(),
    });

    const returnUrl = resolvePolarPortalReturnUrl();

    const session = await polar.customerSessions.create(
      externalCustomerId
        ? { externalCustomerId, returnUrl }
        : { customerId, returnUrl }
    );

    return NextResponse.redirect(session.customerPortalUrl, { status: 302 });
  } catch (error: any) {
    const status = error?.statusCode ?? error?.status ?? 502;
    return NextResponse.json(
      {
        success: false,
        error: 'Polar customer portal session creation failed.',
        details: error?.message || String(error),
      },
      { status }
    );
  }
}
