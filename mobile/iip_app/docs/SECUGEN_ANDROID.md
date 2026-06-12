# SecuGen HU20 — Android Flutter integration

SDK folder in repo (you extracted):

```text
FDX_SDK_PRO_FD_Android_Studio_4_22/
├── FDxSDKProFDAndroid.jar          ← Java API
├── SecuGenUSBFDAndroidStudio.apk   ← demo app (test scanner first)
├── readme.txt
└── SecuGenUSBFDDist/app/
    ├── libs/FDxSDKProFDAndroid.jar
    └── src/main/jniLibs/           ← native .so per CPU (arm64-v8a, etc.)
```

## Step 1 — Test hardware with SecuGen demo (recommended)

1. Copy `SecuGenUSBFDAndroidStudio.apk` to your Android phone.
2. Connect **HU20** via **USB OTG** adapter.
3. Install and open **SecuGen USB Fingerprint Demo v4.22**.
4. Allow **USB permission** when prompted.
5. Capture a fingerprint in the demo.

If the demo fails, fix OTG/cable/phone before integrating IIP.

Requirements (from `readme.txt`):

- Android **8.1+** (API 27)
- Phone with **USB host (OTG)**

## Step 2 — Install SDK into IIP Flutter app

From repo root:

```bash
chmod +x mobile/iip_app/scripts/install-secugen-sdk.sh
mobile/iip_app/scripts/install-secugen-sdk.sh
```

This copies into `mobile/iip_app/android/app/`:

| Source | Destination |
|--------|-------------|
| `FDxSDKProFDAndroid.jar` | `android/app/libs/` |
| `jniLibs/*` (all `.so`) | `android/app/src/main/jniLibs/` |
| `device_filter.xml` | `res/xml/secugen_usb_device_filter.xml` |

## Step 3 — Build on a physical Android device

```bash
cd mobile/iip_app
flutter run --dart-define=API_BASE_URL=http://192.168.1.59:8010
```

Use a **real phone** (emulator cannot use USB OTG scanner).

## Step 4 — Use AFIS in the app

1. Sign in to IIP Mobile.
2. Center FAB → **Field face recognition**.
3. **Fingerprint search** — status banner → **Scanner ready** (after OTG + permission) → **Scan & search** → view dossier matches.
4. **Tag fingerprint to suspect** — select a dossier → choose finger → **Capture & submit** → supervisor approves on web portal at `/suspects/fingerprint-approvals`.

Flow:

```text
HU20 → SecuGen FDx SDK (on phone) → Flutter → ml-gateway /fingerprints/identify → OpenAFIS
```

Templates are stored in PostgreSQL and on disk (`data/openafis/templates/`); matching uses OpenAFIS (not Elasticsearch).

## HU20 USB IDs (supported)

Vendor `0x1162` — product IDs include:

- `0x2200` — U20 / Hamster PRO 20
- `0x2220` — U20-AP
- `0x2240` — U20-A

## Troubleshooting

| Issue | Fix |
|-------|-----|
| SDK not installed | Run `install-secugen-sdk.sh` and rebuild |
| `UnsatisfiedLinkError` / `.so` missing | Re-run install script (jniLibs not copied) |
| Device not found | OTG adapter; replug; grant USB permission |
| Demo works, IIP fails | Rebuild app after install script |
| No AFIS matches | Enroll prints in portal first; ml-gateway on :8020 |

## Do not commit

The SDK ZIP and copied `jniLibs` are large — keep `FDX_SDK_PRO_FD_Android_Studio_4_22/` local or add to `.gitignore`. Re-run the install script on each machine.

## Mac / iMac

Not used for capture. Web portal enrollment and **fingerprint approvals** (`/suspects/fingerprint-approvals`); field capture/search uses **Android + OTG**.
