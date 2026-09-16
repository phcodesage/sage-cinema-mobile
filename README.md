# Sage Cinema Mobile

React Native Android app for Sage Cinema, built with Expo SDK 57.

## Run it

```bash
npm install
npx expo start
```

Press `a` in the Expo CLI to open an Android emulator, or scan the QR code with Expo Go. The app uses `https://sage-cinema-nu.vercel.app` by default.

For a local Next.js API while using the Android emulator:

```bash
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000 npx expo start
```

To create a native Android build with a connected emulator or device:

```bash
npx expo run:android
```

The app’s Play action opens the existing Sage Cinema player URL so the current streaming resolver and playback stack remain the source of truth.
