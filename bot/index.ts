// This file acts as a gatekeeper to prevent the bot from running in unsupported environments.

// Check 1: Ensure we are in a Node.js environment, not a browser.
const isNodeEnvironment = typeof window === 'undefined';

// Check 2: Ensure the essential environment variable is set.
const token = process.env.TELEGRAM_BOT_TOKEN;

if (isNodeEnvironment && token) {
  // If both checks pass, load and run the main bot logic.
  console.log("Node.js environment and TELEGRAM_BOT_TOKEN detected. Starting bot...");
  require('./run'); 
} else {
  // If checks fail, log an informative message and do nothing.
  if (!isNodeEnvironment) {
    console.log("Skipping Telegram bot launch: Detected browser environment.");
  } else if (!token) {
    console.log("Skipping Telegram bot launch: TELEGRAM_BOT_TOKEN is not set.");
    console.log("This is the expected behavior on development platforms without backend secrets.");
  }
}
