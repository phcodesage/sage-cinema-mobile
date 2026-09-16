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

For a standalone Android artifact with the JavaScript bundle embedded:

```bash
cd android
NODE_ENV=production ./gradlew clean assembleRelease
```

If an existing checkout was moved to a new path and Gradle reports a dependency path from the old location, regenerate the ignored native build state before retrying:

```bash
cd android
./gradlew clean
```

The app’s Play action requests the existing unified video-source API and plays the returned HLS/MP4/DASH stream with Expo Video’s native Android Media3 player. The player includes native controls, landscape fullscreen, quality switching, source retry, and bounded buffering. TV playback currently starts at season 1, episode 1; external subtitle rendering and a season/episode picker are planned follow-ups.
