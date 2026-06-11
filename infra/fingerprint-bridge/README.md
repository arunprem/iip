# Fingerprint capture bridge

The suspect portal **Scan** button does not talk to the USB scanner directly. It calls a small HTTP service on the **same computer** as the browser:

```
http://127.0.0.1:17890/capture
```

## Quick start (development / Mac)

```bash
# Mock templates (works on Mac — no real scanner)
FINGERPRINT_BRIDGE_MOCK=1 python3 infra/fingerprint-bridge/bridge.py
```

Leave that terminal open, then click **Scan** in the portal.

Check status:

```bash
curl http://127.0.0.1:17890/status
```

## SecuGen HU20 on Mac — important

SecuGen **FDx SDK** officially supports **Windows and Linux only**, not macOS.

| What you see | Meaning |
|--------------|---------|
| Device plugged into iMac | USB may show in System Information |
| Portal **Scan** fails | No macOS SDK + bridge not running |
| **Upload .bin** works | Use template exported from SecuGen software on Windows |

### Options on Mac

1. **Dev / testing** — run mock bridge (command above).
2. **Real prints** — capture on a **Windows or Linux** PC with [FDx SDK Pro](https://secugen.com/products/sdk/), run this bridge there, set portal env `VITE_FINGERPRINT_BRIDGE_URL=http://<pc-ip>:17890` if the browser is on another machine.
3. **Upload .bin** — use SecuGen enrollment/demo app on Windows to save an ISO template, then **Upload .bin** in the wizard.

## Real capture on Linux / Windows

1. Install SecuGen drivers and FDx SDK Pro.
2. Set library path (when your FDx integration is wired):

```bash
export SGFDX_LIB=/path/to/libsgfplib.so   # Linux
# or sgfplib.dll on Windows
python3 infra/fingerprint-bridge/bridge.py
```

3. Confirm USB:

```bash
curl http://127.0.0.1:17890/status
```

## Portal configuration

Default bridge URL: `http://127.0.0.1:17890`

Override in `frontend/apps/iip-portal/.env.local`:

```
VITE_FINGERPRINT_BRIDGE_URL=http://127.0.0.1:17890
```

## Troubleshooting

| Error | Fix |
|-------|-----|
| Bridge unavailable / connection refused | Start `bridge.py` in a terminal |
| macOS + HU20 connected | Use mock mode or Windows/Linux bridge; macOS has no FDx SDK |
| Scan works but duplicate search fails | Ensure ml-gateway (8020) and Elasticsearch are running |
