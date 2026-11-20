# Berlin Route (Android)

A WebView-based Android app that shows a route intro animation:
the S1 track (elevated) and U5 track (underground) appear one after the other, then the
vehicle travels the route, then live navigation starts.

Screens (in `app/src/main/assets/www/`):
- `index.html`  real map: OpenStreetMap streets and 3D buildings (MapLibre GL + OpenFreeMap tiles), animated route and camera
- `layers.html` stylized 3D scene: elevated S1, underground U5, street-level tram, city layer (Three.js)

Map libraries are bundled in `www/lib/`, so only the map tiles need internet.

## Build

Android Studio (recommended): open this folder, let Gradle sync, press Run, or
Build > Build App Bundle(s) / APK(s) > Build APK(s).

Command line (needs JDK 17+ and the Android SDK; create the wrapper once with `gradle wrapper`):
    ./gradlew assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
    ./gradlew bundleRelease        # AAB for Google Play (needs a signing key)

## Before you publish

- Change `applicationId` in `app/build.gradle.kts` (it can never change after the first upload).
- Check Google Play's current target API level requirement and raise `targetSdk` if needed.
- Sign the release build (Play App Signing with an upload key).
- Add a privacy policy page (required by Play).
- Keep the map credits visible (OpenFreeMap, OpenMapTiles, OpenStreetMap).
- Free public tile servers are fine for a demo. For production, self-host or use a paid tile provider.

## Known limits

- Station coordinates are approximate and the lines are straight segments. Use VBB GTFS shapes for real tracks.
- Departure info on the live card is placeholder text.
- Vehicle models are generic boxes, not real train designs.
- This project was written without access to the Android SDK, so it has not been compiled yet. If Gradle reports a version problem, update the plugin versions in the root `build.gradle.kts`.
- The OpenFreeMap style URL may change. Check `style:` in `index.html` if the map stays blank.
