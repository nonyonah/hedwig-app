import { NextRequest, NextResponse } from 'next/server';
import { Polar } from '@polar-sh/sdk';
import {
  resolvePolarCheckoutReturnUrl,
  resolvePolarCheckoutSuccessUrl,
  resolvePolarServer
} from '@/lib/billing/polar';

const polarAccessToken = String(process.env.POLAR_ACCESS_TOKEN || '').trim();

const parseJsonParam = (value: string | null): Record<string, string | number | boolean> | undefined => {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    const result: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        result[k] = v;
      }
    }
    return Object.keys(result).length ? result : undefined;
  } catch {
    return undefined;
  }
};

export async function GET(req: NextRequest): Promise<Response> {
  if (!polarAccessToken) {
    return NextResponse.json(
      { success: false, error: 'POLAR_ACCESS_TOKEN is not configured.' },
      { status: 503 }
    );
  }

  const products = req.nextUrl.searchParams
    .getAll('products')
    .map((v) => v.trim())
    .filter(Boolean);

  if (!products.length) {
    return NextResponse.json(
      { success: false, error: 'Missing products in query params.' },
      { status: 400 }
    );
  }

  const successUrl = new URL(resolvePolarCheckoutSuccessUrl());
  successUrl.searchParams.set('checkoutId', '{CHECKOUT_ID}');

  try {
    const polar = new Polar({
      accessToken: polarAccessToken,
      server: resolvePolarServer(),
    });

    const checkout = await polar.checkouts.create({
      products,
      successUrl: successUrl.toString(),
      returnUrl: resolvePolarCheckoutReturnUrl(),
      externalCustomerId: req.nextUrl.searchParams.get('customerExternalId')?.trim() || undefined,
      customerEmail: req.nextUrl.searchParams.get('customerEmail')?.trim() || undefined,
      customerName: req.nextUrl.searchParams.get('customerName')?.trim() || undefined,
      metadata: parseJsonParam(req.nextUrl.searchParams.get('metadata')),
    });

    return NextResponse.redirect(checkout.url, { status: 302 });
  } catch (error: any) {
    const status = error?.statusCode ?? error?.status ?? 502;
    return NextResponse.json(
      {
        success: false,
        error: 'Polar checkout session creation failed.',
        details: error?.message || String(error),
      },
      { status }
    );
  }
}
