# Supabase Email Templates

Copy these templates to your Supabase dashboard:
**Authentication** → **Email Templates**

---

## Magic Link / OTP Template

**Subject:** Your Hedwig verification code

**Body:**
```html
<h2>Your verification code</h2>

<p>Enter this code to sign in to Hedwig:</p>

<h1 style="font-size: 32px; letter-spacing: 4px; font-weight: bold; color: #3ECF8E;">{{ .Token }}</h1>

<p>This code expires in 10 minutes.</p>

<p>If you didn't request this code, you can safely ignore this email.</p>
```

---

## Confirm Email Template

**Subject:** Confirm your Hedwig account

**Body:**
```html
<h2>Confirm your email</h2>

<p>Your verification code is:</p>

<h1 style="font-size: 32px; letter-spacing: 4px; font-weight: bold; color: #3ECF8E;">{{ .Token }}</h1>

<p>Or click the link below to confirm your email:</p>

<p><a href="{{ .ConfirmationURL }}">Confirm Email Address</a></p>
```

---

## Invite User Template

**Subject:** You've been invited to Hedwig

**Body:**
```html
<h2>You've been invited</h2>

<p>You've been invited to create an account on Hedwig.</p>

<p>Your verification code is:</p>

<h1 style="font-size: 32px; letter-spacing: 4px; font-weight: bold; color: #3ECF8E;">{{ .Token }}</h1>

<p><a href="{{ .ConfirmationURL }}">Accept Invitation</a></p>
```

---

## Redirect URLs Configuration

In **Authentication** → **URL Configuration**:

Add these to **Redirect URLs**:
- `hedwig://auth/callback`
- `exp://192.168.0.229:8081/--/auth/callback` (for Expo Go development)

**Site URL** should be:
- `hedwig://` (for production builds)

---

## OAuth Provider Setup

### Google
1. Go to Google Cloud Console → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID (iOS and Android)
3. Add authorized redirect URI:
   - `https://qahogchnetmhtfsyjtxl.supabase.co/auth/v1/callback`

### Apple
1. Go to Apple Developer Portal → Certificates, Identifiers & Profiles
2. Create a Service ID for Sign in with Apple
3. Configure Web Authentication:
   - Domain: `qahogchnetmhtfsyjtxl.supabase.co`
   - Return URL: `https://qahogchnetmhtfsyjtxl.supabase.co/auth/v1/callback`
