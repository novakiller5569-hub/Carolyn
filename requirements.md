# Replit Setup Instructions for AI Agent

This document provides the necessary configuration for setting up and running the Yoruba Cinemax project on Replit.

## 1. Required Secrets (Environment Variables)

The following secrets **must** be set in the Replit "Secrets" tab before running the project. The application will fail to start if any of these are missing.

| Key                       | Description                                                                                             | Example Value                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `API_KEY`                 | Your Google Gemini API Key for AI features.                                                             | `AIzaSy...`                    |
| `TELEGRAM_BOT_TOKEN`      | The token for your admin bot from Telegram's BotFather.                                                 | `123456:ABC-DEF...`            |
| `ADMIN_TELEGRAM_USER_ID`  | Your personal numerical Telegram user ID. This restricts bot access to you only.                        | `987654321`                    |
| `YOUTUBE_API_KEY`         | Your YouTube Data API v3 key for fetching video details.                                                | `AIzaSy...`                    |
| `WEBSITE_BASE_URL`        | The public URL of this Replit instance. You can find this in the browser's address bar once it runs.    | `https://your-app-name.replit.dev`    |
| `AWS_REGION`              | The AWS region where you have enabled Bedrock model access.                                             | `us-east-1`                    |
| `AWS_ACCESS_KEY_ID`       | Your AWS IAM user's Access Key ID for Bedrock.                                                          | `AKIAIOSFODNN7EXAMPLE`         |
| `AWS_SECRET_ACCESS_KEY`   | Your AWS IAM user's Secret Access Key for Bedrock.                                                      | `wJalrXUtnFEMI...`             |

## 2. Build & Run Commands

The project is configured to be built and run using the following standard Node.js commands:

1.  **Installation:** `npm install`
2.  **Run:** `npm start`

The `npm start` script will automatically build the frontend and backend, then start the Express server which also launches the Telegram bot.