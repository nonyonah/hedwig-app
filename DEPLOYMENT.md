# Hedwig Deployment Guide

This guide covers deploying the **Hedwig Backend** to **Google Cloud Run** and the **Mobile App** to **TestFlight**.

---

## 🚀 Part 1: Backend Deployment (Google Cloud Run)

### Prerequisites
1.  **Google Cloud CLI (`gcloud`)**: Installed and authenticated.
2.  **Docker**: Installed (optional if using Cloud Build, but recommended).
3.  **Google Cloud Project**: Created with billing enabled.

### 1. Initialize Google Cloud
Run these commands in your terminal:
```bash
# Login to Google Cloud
gcloud auth login

# Set your project ID (replace [PROJECT_ID] with your actual project ID)
gcloud config set project [PROJECT_ID]

# Enable necessary services
gcloud services enable cloudbuild.googleapis.com run.googleapis.com containerregistry.googleapis.com
```

### 2. Configure Environment Variables
Cloud Run requires environment variables to be set. You have a few options:
*   **Option A (CLI flags):** Pass them during deploy (good for few vars).
*   **Option B (Secret Manager):** For sensitive keys like private keys and API secrets.
*   **Option C (.env file):** *Not recommended for production* as it bakes secrets into the image, but `dotenv` is configured in the code.

For this guide, we assume you will set them via the Cloud Console or CLI flags for security.

### 3. Deploy
Navigate to the backend directory and deploy:

```bash
cd hedwig-backend

# Deploy command (this builds the image using Cloud Build and deploys it)
gcloud run deploy hedwig-backend \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 3000
```
*   `--source .`: Uploads source code and builds remotely.
*   `--allow-unauthenticated`: Makes the API public (remove this if you want IAM protection, but mobile app needs public access usually).

### 4. Set Environment Variables
After deployment, go to the [Google Cloud Run Console](https://console.cloud.google.com/run), select `hedwig-backend`, click **"Edit & Deploy New Revision"**, and add your environment variables (from your `.env` file) in the **"Variables & Secrets"** tab.

**Critical Variables:**
*   `DATABASE_URL` (Supabase connection string)
*   `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
*   `OPENAI_API_KEY`, `GEMINI_API_KEY`
*   `PRIVY_APP_ID`, `PRIVY_APP_SECRET`

---

## 📱 Part 2: Mobile App (TestFlight)

### Prerequisites
1.  **Apple Developer Account**: Enrollment ($99/year).
2.  **EAS CLI**: `npm install -g eas-cli`
3.  **Expo Account**: Logged in via `eas login`.

### 1. Configure Build Profile
The `eas.json` is already configured for production builds.
Ensure your `app.json` has the correct `bundleIdentifier`:
```json
"ios": {
  "bundleIdentifier": "com.yourcompany.hedwig" 
}
```
*Make sure to register this Bundle ID in your Apple Developer Portal if EAS doesn't do it automatically.*

### 2. Build for iOS (TestFlight)
Run the following command in the project root:

```bash
# Run from project root (not hedwig-backend)
eas build --platform ios --profile production
```

*   If this is your first time, EAS will ask to generate **Distribution Certificates** and **Provisioning Profiles**. Answer **Yes** to let EAS manage them.
*   This process uploads your code to Expo's build servers.

### 3. Submit to TestFlight
Once the build completes (you'll get a link), you can submit it to App Store Connect:

```bash
eas submit --platform ios
```
*   Select the build you just created.
*   EAS will upload the `.ipa` file to App Store Connect.

### 4. Invite Testers
1.  Go to [App Store Connect](https://appstoreconnect.apple.com).
2.  Select **"My Apps"** -> **Hedwig**.
3.  Go to **"TestFlight"** tab.
4.  Add **Internal Testing** group (for your team) or **External Testing** group.
5.  Add testers by email. They will receive an invite to download the app via the TestFlight app.

---

## 🛠 Troubleshooting

*   **Cloud Run Healthcheck Fails:** ensure your `Dockerfile` has `CMD` that listens on `process.env.PORT`. *We patched this automatically.*
*   **EAS Build Fails locally:** Try running `npx expo doctor` to check for dependency issues.
*   **Missing Assets:** Ensure all assets are in `assets/` and referenced correctly in `app.json`.
