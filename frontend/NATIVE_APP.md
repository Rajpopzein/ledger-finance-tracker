# Ledger Native App

Ledger uses the existing React/Vite frontend inside a Tauri v2 shell.

## Targets

- Windows
- macOS
- Android 7.0+ (Tauri minimum SDK 24)

The native app talks to the existing hosted Ledger API at:
`https://ledger-finance-raj-api.onrender.com/api`

Authentication continues to use Ledger's bearer session token. API keys and finance data are not embedded in the application binary.

## Desktop development

Install Node.js, Rust and the Tauri platform prerequisites, then:

```bash
cd frontend
npm install
npm run app:dev
```

Build the desktop application:

```bash
npm run app:build
```

Run the build on the target OS. Windows installers must be built on Windows and macOS bundles must be built on macOS.

## Android development

Install Android Studio, Android SDK/NDK and the Rust Android targets.

Initialize the generated Android project once:

```bash
cd frontend
npm install
npm run app:android:init
```

Run on an emulator or connected device:

```bash
npm run app:android:dev
```

Create an APK:

```bash
npm run app:android:build
```

The committed Tauri source is under `frontend/src-tauri`. The generated Android Gradle project is created by `tauri android init`.

## CI artifacts

The repository includes the manual **Build Ledger Native Apps** GitHub workflow. Run it when you want unsigned development artifacts for Windows, macOS and Android.

Production distribution still requires the platform-specific signing credentials:
- Windows code-signing certificate
- Apple Developer signing/notarization
- Android upload keystore
