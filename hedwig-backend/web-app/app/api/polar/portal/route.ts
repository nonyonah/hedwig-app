import { NextRequest, NextResponse } from 'next/server';
import { resolvePolarPortalReturnUrl, resolvePolarServer } from '@/lib/billing/polar';

export const runtime = 'nodejs';

const polarAccessToken = String(process.env.POLAR_ACCESS_TOKEN || '').trim();

const polarBaseUrl = () =>
  resolvePolarServer() === 'sandbox'
    ? 'https://sandbox-api.polar.sh'
    : 'https://api.polar.sh';

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

  // Build body with snake_case as required by the Polar REST API
  const body: Record<string, string> = {
    return_url: resolvePolarPortalReturnUrl(),
  };
  if (externalCustomerId) body.external_customer_id = externalCustomerId;
  else body.customer_id = customerId;

  try {
    const response = await fetch(`${polarBaseUrl()}/v1/customer-sessions/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${polarAccessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return NextResponse.json(
        { success: false, error: 'Polar portal session creation failed.', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json() as { customer_portal_url?: string };
    const portalUrl = String(data?.customer_portal_url || '').trim();
    if (!portalUrl) {
      return NextResponse.json(
        { success: false, error: 'Polar did not return a portal URL.' },
        { status: 502 }
      );
    }

    return NextResponse.redirect(portalUrl, { status: 302 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: 'Unable to reach Polar API.', details: error?.message || String(error) },
      { status: 502 }
    );
  }
}
