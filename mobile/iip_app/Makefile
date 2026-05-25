# Run from mobile/iip_app. Repo root also has: make mobile-dev (from kp-inteligence/)

.PHONY: mobile-bootstrap mobile-dev mobile-dev-android mobile-dev-device pub-get

API_HOST ?= http://127.0.0.1:8010
# Android emulator cannot use 127.0.0.1 for host machine — use 10.0.2.2
API_ANDROID ?= http://10.0.2.2:8010
# Physical device on Wi‑Fi must use the Mac Wi‑Fi IP (not Ethernet). Override if needed:
#   make mobile-dev-device API_DEVICE=http://192.168.1.59:8010
WIFI_IF ?= $(shell networksetup -listallhardwareports 2>/dev/null | awk '/Hardware Port: (Wi-Fi|AirPort)/{getline; if (/^Device:/) print $$2}')
API_DEVICE ?= http://$(shell ipconfig getifaddr $(WIFI_IF) 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo 127.0.0.1):8010

mobile-bootstrap:
	flutter create . --project-name iip_app --org gov.in.iip

pub-get:
	flutter pub get

mobile-dev: pub-get
	flutter run --dart-define=API_BASE_URL=$(API_HOST)

mobile-dev-android: pub-get
	flutter run --dart-define=API_BASE_URL=$(API_ANDROID)

# USB/wireless physical device (e.g. adb id c4022e5d)
mobile-dev-device: pub-get
	@echo "API_BASE_URL=$(API_DEVICE)"
	flutter run --dart-define=API_BASE_URL=$(API_DEVICE)
