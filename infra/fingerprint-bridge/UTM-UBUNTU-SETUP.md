# SecuGen HU20 via Ubuntu VM in UTM (on iMac)

Yes — you can use your **Ubuntu ARM VM in UTM** as the capture machine. The iMac runs the portal; the VM talks to the scanner over USB.

```
[iMac browser]  →  http://<VM-IP>:17890/capture  →  [Ubuntu VM + FDx SDK]  →  [HU20 USB]
```

## Before you start — ARM vs x86_64

SecuGen **FDx SDK for Linux** is tested mainly on **x86_64 Ubuntu**. ARM (aarch64) is listed for Raspberry Pi but can be hit-or-miss.

| VM type | Recommendation |
|---------|----------------|
| **Ubuntu 22.04 x86_64** in UTM (emulated on Apple Silicon) | **Best chance** — use SecuGen’s standard x64 Linux SDK |
| **Ubuntu ARM64** (native on Apple Silicon) | Try only if SecuGen’s Linux package includes **aarch64** `libsgfplib.so` |

If ARM fails (`wrong ELF class`, `cannot find libsgfplib`), create an **x86_64 Ubuntu** UTM VM instead.

---

## Step 1 — Request SecuGen Linux SDK

1. Go to [SecuGen — Request free software](https://secugen.com/request-free-software/)
2. Request **FDx SDK Pro for Linux**
3. Unzip in the VM, e.g. `/opt/secugen/FDxSDK_Pro_Linux`

---

## Step 2 — UTM: USB passthrough

1. Plug **HU20** into the iMac
2. Open **UTM** → your Ubuntu VM → **Settings** → **USB**
3. Attach the **SecuGen** / **Hamster** device to the VM (not the Mac host)
4. Start the VM

Verify inside Ubuntu:

```bash
lsusb | grep -i 1162
# or
lsusb
```

You should see vendor **1162** (SecuGen).

> USB can only be used by **one** side at a time — Mac or VM, not both.

---

## Step 3 — Install drivers + SDK (inside Ubuntu)

```bash
sudo apt update
sudo apt install -y build-essential libusb-0.1-4 libgtk2.0-dev python3

cd /opt/secugen/FDxSDK_Pro_Linux/lib/linux
sudo make install
sudo ldconfig
```

### HU20 (Hamster Pro 20) Java/native config

```bash
cd /opt/secugen/FDxSDK_Pro_Linux/lib/linux3
sudo cp libjnisgfplib.so.3.8.0.fdu05_rename libjnisgfplib.so
sudo make uninstall install
```

### udev — allow non-root access

```bash
sudo groupadd -f SecuGen
sudo usermod -aG SecuGen $USER

sudo tee /etc/udev/rules.d/99-secugen.rules <<'EOF'
SUBSYSTEM=="usb", ATTR{idVendor}=="1162", MODE="0660", GROUP="SecuGen"
EOF

sudo udevadm control --reload-rules
sudo udevadm trigger
```

**Reboot the VM**, replug USB if needed, then test SecuGen demo:

```bash
cd /opt/secugen/FDxSDK_Pro_Linux/bin/linux
./FDxSDKPro_Sample   # or the HU20 demo binary from the SDK package
```

If the demo captures a print, the hardware path is good.

---

## Step 4 — Copy IIP bridge into the VM

From the iMac project folder, copy `infra/fingerprint-bridge/` into the VM (shared folder, `scp`, or git clone):

```bash
# Inside Ubuntu VM
cd ~/kp-inteligence   # or your clone path
```

---

## Step 5 — Run bridge (listen on all interfaces)

The Mac browser must reach the VM over the network — not `127.0.0.1` inside the VM only.

```bash
export FINGERPRINT_BRIDGE_HOST=0.0.0.0
export FINGERPRINT_BRIDGE_PORT=17890
export SGFDX_LIB=/usr/local/lib/libsgfplib.so   # adjust after make install

python3 infra/fingerprint-bridge/bridge.py
```

Check from **inside the VM**:

```bash
curl http://127.0.0.1:17890/status
```

Check from **iMac** (replace with your VM IP):

```bash
curl http://192.168.64.x:17890/status
```

### Find VM IP

Inside Ubuntu:

```bash
hostname -I
```

UTM **Shared Network** often uses `192.168.64.x`. **Bridged** uses your LAN IP (e.g. `192.168.1.x`).

---

## Step 6 — Point the portal on iMac at the VM

Create or edit `frontend/apps/iip-portal/.env.local` on the **iMac**:

```
VITE_FINGERPRINT_BRIDGE_URL=http://192.168.64.X:17890
```

Restart the portal dev server (`npm run dev`), open **Suspects → New → Prints**, click **Refresh** on the bridge banner, then **Scan**.

---

## Step 7 — Firewall (if status fails from Mac)

Inside Ubuntu:

```bash
sudo ufw allow 17890/tcp
# or temporarily
sudo ufw disable   # dev only
```

---

## Current IIP bridge limitation

The bridge **detects USB** and supports **mock mode** today. **Full FDx live capture** in `bridge.py` requires `SGFDX_LIB` and the next SDK wiring step.

**Until that is wired:**

1. Confirm capture with SecuGen’s **Linux demo** in the VM
2. Export / save **ISO template `.bin`** from the demo
3. Use **Upload .bin** in the portal on iMac

Or run mock in the VM for end-to-end UI testing:

```bash
FINGERPRINT_BRIDGE_MOCK=1 FINGERPRINT_BRIDGE_HOST=0.0.0.0 python3 infra/fingerprint-bridge/bridge.py
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `lsusb` empty in VM | Re-attach USB in UTM; try different USB port |
| Permission denied on device | udev rules + `SecuGen` group + reboot |
| Mac cannot curl VM IP | Use `FINGERPRINT_BRIDGE_HOST=0.0.0.0`, check UTM network mode + firewall |
| `wrong ELF class` on ARM | Use **x86_64 Ubuntu** VM instead |
| Demo works, portal Scan fails | Set `VITE_FINGERPRINT_BRIDGE_URL` to VM IP; restart portal |
| Bridge says mock only | Expected until FDx ctypes capture is added to `bridge.py` |

---

## Quick checklist

- [ ] SecuGen Linux SDK installed in VM  
- [ ] `lsusb` shows 1162 in VM  
- [ ] SecuGen demo captures in VM  
- [ ] Bridge running with `FINGERPRINT_BRIDGE_HOST=0.0.0.0`  
- [ ] `curl http://<VM-IP>:17890/status` works **from iMac**  
- [ ] `VITE_FINGERPRINT_BRIDGE_URL` set on iMac portal  
