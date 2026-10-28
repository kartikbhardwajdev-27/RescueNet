// The address the first-run screen starts with, chosen when the APK is built:
//
//   RESCUENET_SERVER_URL=https://rescuenet.example.com npm run apk
//
// scripts/build-mobile.mjs checks it and passes it on as NEXT_PUBLIC_RESCUENET_SERVER_URL.
// It is only a starting value: the person can change it on the first-run screen and on the
// Settings page, and what they save always wins. Empty when the build was made without it.
export const DEFAULT_SERVER_URL = process.env.NEXT_PUBLIC_RESCUENET_SERVER_URL ?? "";
