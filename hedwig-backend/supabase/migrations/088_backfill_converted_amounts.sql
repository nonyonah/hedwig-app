-- ─── Backfill converted_amount_usd using live Frankfurter API rates ─────────
-- Fetches live exchange rates from api.frankfurter.app (ECB data), supplemented
-- by open.er-api.com for currencies Frankfurter doesn't cover (NGN, GHS, KES, etc.).
-- Falls back to approximate hardcoded rates if the http extension is unavailable
-- or both APIs are unreachable.

CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

DO $$
DECLARE
  raw_json jsonb;
  rates_json jsonb;
  rate_record record;
  api_ok boolean := false;
BEGIN

  -- 1. Try live Frankfurter API (try both schema-qualified and public variants)
  BEGIN
    BEGIN
      raw_json := ((extensions.http_get('https://api.frankfurter.app/latest?from=USD')).content)::jsonb;
    EXCEPTION WHEN OTHERS THEN
      raw_json := (http_get('https://api.frankfurter.app/latest?from=USD')).content::jsonb;
    END;
    IF raw_json ? 'rates' THEN
      rates_json := raw_json -> 'rates';
      api_ok := true;
      RAISE NOTICE 'Using Frankfurter API.';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Frankfurter API unavailable: %', SQLERRM;
  END;

  -- 2. If Frankfurter failed, try open.er-api.com (covers NGN/GHS/KES etc.)
  IF NOT api_ok THEN
    BEGIN
      BEGIN
        raw_json := ((extensions.http_get('https://open.er-api.com/v6/latest/USD')).content)::jsonb;
      EXCEPTION WHEN OTHERS THEN
        raw_json := (http_get('https://open.er-api.com/v6/latest/USD')).content::jsonb;
      END;
      IF raw_json ? 'rates' THEN
        rates_json := raw_json -> 'rates';
        api_ok := true;
        RAISE NOTICE 'Using open.er-api.com fallback.';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Fallback API also unavailable: %', SQLERRM;
    END;
  END IF;

  -- 3. If live APIs failed, use hardcoded approximate rates
  IF NOT api_ok THEN
    RAISE NOTICE 'Using hardcoded approximate rates.';
    rates_json := jsonb_build_object(
      'EUR', 0.92, 'GBP', 0.78, 'NGN', 1550, 'GHS', 15,
      'KES', 130, 'ZAR', 18, 'CAD', 1.37, 'AUD', 1.52,
      'JPY', 155, 'CNY', 7.25, 'INR', 83, 'BRL', 5.4,
      'MXN', 18.5
    );
  END IF;

  -- 4. Backfill imported_transactions (null + previously backfilled with approximate rates)
  FOR rate_record IN
    SELECT id, amount, upper(trim(currency)) AS curr
    FROM imported_transactions
    WHERE (converted_amount_usd IS NULL OR fx_source = 'backfill-2026-07')
      AND currency IS NOT NULL
      AND upper(trim(currency)) != 'USD'
      AND amount > 0
  LOOP
    IF rates_json ? rate_record.curr THEN
      UPDATE imported_transactions
      SET converted_amount_usd = ROUND((rate_record.amount / (rates_json ->> rate_record.curr)::numeric)::numeric, 6),
          fx_rate = ROUND(((rates_json ->> rate_record.curr)::numeric)::numeric, 6),
          fx_source = CASE WHEN api_ok THEN 'frankfurter-live' ELSE 'backfill-2026-07' END
      WHERE id = rate_record.id;
    END IF;
  END LOOP;

  -- 5. Backfill expenses (re-convert all non-USD with live rates)
  FOR rate_record IN
    SELECT id, amount, upper(trim(currency)) AS curr
    FROM expenses
    WHERE currency IS NOT NULL
      AND upper(trim(currency)) != 'USD'
      AND amount > 0
  LOOP
    IF rates_json ? rate_record.curr THEN
      UPDATE expenses
      SET converted_amount_usd = ROUND((rate_record.amount / (rates_json ->> rate_record.curr)::numeric)::numeric, 6)
      WHERE id = rate_record.id;
    END IF;
  END LOOP;

  RAISE NOTICE 'Backfill complete. Source: %', CASE WHEN api_ok THEN 'live API' else 'hardcoded rates' END;
END;
$$;

NOTIFY pgrst, 'reload schema';
