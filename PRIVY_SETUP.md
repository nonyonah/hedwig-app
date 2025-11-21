# Privy Configuration Guide

The errors you are seeing (`Login with Apple not allowed` and `Redirect URL scheme is not allowed`) indicate that your Privy project is not fully configured to allow your Expo app to connect.

## 1. Fix "Redirect URL scheme is not allowed"

This error happens because Privy rejects authentication requests from apps with URL schemes that haven't been allowlisted.

1.  Log in to the [Privy Dashboard](https://dashboard.privy.io).
2.  Select your App.
3.  Go to **Settings** -> **Basics** (or **App Settings**).
4.  Look for **Allowed Redirect URLs**.
5.  Add your app's scheme:
    ```
    hedwig://
    ```
    (Note: It might need `hedwig://auth` or just `hedwig://` depending on the SDK version, but usually `hedwig://` is sufficient or `hedwig://*`).
    *Try adding both `hedwig://` and `hedwig://dashboard` just in case.*

## 2. Fix "Login with Apple not allowed"

This error means Apple Login is either disabled or not configured for your Bundle ID.

1.  In the Privy Dashboard, go to **Login Methods**.
2.  Find **Apple** and click it.
3.  Ensure it is **Enabled**.
4.  If required, add your iOS Bundle ID:
    ```
    com.hedwig.app
    ```
    (This matches the `ios.bundleIdentifier` in your `app.json`).

## 3. Fix Google Login

If Google login is failing with the same "Redirect URL scheme" error, step 1 should fix it.
If it fails with other errors:
1.  Go to **Login Methods** -> **Google**.
2.  Ensure it is **Enabled**.

## 4. Verify Environment Variables

Ensure your `.env` file in `hedwig-app` has the correct keys:
```bash
EXPO_PUBLIC_PRIVY_APP_ID="your-app-id"
EXPO_PUBLIC_PRIVY_CLIENT_ID="your-client-id"
```
(You already have these set, but double-check they match the project where you made the changes above).

## 5. Restart the App

After making changes in the dashboard:
1.  Restart your Expo server:
    ```bash
    npx expo start --clear
    ```
2.  Reload the app on your device/simulator.
