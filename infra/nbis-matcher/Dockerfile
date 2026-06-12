# NBIS mindtct + bozorth3 for IIP fingerprint matching (grayscale capture path).
#
# Prerequisite on host (uses Mac DNS, not Docker build DNS):
#   infra/nbis-matcher/scripts/fetch-nbis.sh
#
# Build: make nbis-docker

FROM gcc:13-bookworm AS builder

WORKDIR /build

COPY vendor/nbis /build/nbis

RUN set -eux; \
    mkdir -p /build/nbis-install; \
    cd /build/nbis; \
    ./setup.sh /build/nbis-install --without-X11 --STDLIBS; \
    make config; \
    for pkg in ijg pcasys commonnbis imgtools an2k mindtct bozorth3; do \
      (cd "$pkg" && make cpheaders); \
    done; \
    for pkg in ijg commonnbis imgtools an2k; do \
      (cd "$pkg" && make libs); \
    done; \
    (cd mindtct && make libs && make bins); \
    (cd bozorth3 && make libs && make bins); \
    install -m 0755 mindtct/bin/mindtct /usr/local/bin/mindtct; \
    install -m 0755 bozorth3/bin/bozorth3 /usr/local/bin/bozorth3; \
    mindtct -h 2>&1 | head -1 || true; \
    bozorth3 2>&1 | head -1 || true

FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/local/bin/mindtct /usr/local/bin/mindtct
COPY --from=builder /usr/local/bin/bozorth3 /usr/local/bin/bozorth3
COPY iip_nbis_cli.py /usr/local/bin/iip-nbis-cli

RUN chmod +x /usr/local/bin/iip-nbis-cli \
    && mkdir -p /data/xyt /data/images

ENV NBIS_GALLERY_DIR=/data/xyt
VOLUME ["/data/xyt", "/data/images"]

CMD ["sleep", "infinity"]
