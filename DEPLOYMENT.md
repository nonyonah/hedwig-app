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
  --region europe-west1 \
  --allow-unauthenticated \
  --port 3000
```
*   `--source .`: Uploads source code and builds remotely.
*   `--allow-unauthenticated`: Makes the API public (remove this if you want IAM protection, but mobile app needs public access usually).

### 4. Set Environment Variables (Automated with Secret Manager)
Since you are using GitHub for deployment, you should upload your secrets to Google Secret Manager and attach them to your running service.

We provided a script to automate this:

1.  Ensure your `hedwig-backend/.env` file contains all necessary secrets, including `DATABASE_URL`.
2.  Run the setup script:
    ```bash
    cd hedwig-backend
    chmod +x setup_secrets.sh
    ./setup_secrets.sh
    ```

This script will:
*   Read secrets from your local `.env`.
*   Create/Update them in **Google Secret Manager**.
*   Run `gcloud run services update` to attach them to your `hedwig-backend` service.

**Note:** If `DATABASE_URL` is missing from your `.env`, you must add it before running the script.

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

*   **Cloud Run "Container failed to start":**
    *   This often means the application crashed on startup.
    *   **Common Cause:** The app tries to read a secret (like `SUPABASE_SERVICE_ROLE_KEY`) but fails because the Cloud Run Service Account lacks permission to access Google Secret Manager.
    *   **Fix:** Run `./fix_iam.sh` in `hedwig-backend/` to grant the necessary "Secret Accessor" role. Then redeploy.
*   **Cloud Run Healthcheck Fails:** ensure your `Dockerfile` has `CMD` that listens on `process.env.PORT`. *We patched this automatically.*
*   **EAS Build Fails locally:** Try running `npx expo doctor` to check for dependency issues.
*   **Missing Assets:** Ensure all assets are in `assets/` and referenced correctly in `app.json`.
