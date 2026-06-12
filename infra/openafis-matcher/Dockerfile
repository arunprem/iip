# Build OpenAFIS + IIP identify CLI for ISO 19794-2:2005 template matching.
#
# Prerequisite on host (uses Mac DNS, not Docker build DNS):
#   infra/openafis-matcher/scripts/fetch-openafis.sh
#
# No apt-get — gcc from gcc:13-bookworm, cmake binary from GitHub releases.

FROM gcc:13-bookworm AS builder

ARG CMAKE_VERSION=3.28.3
ARG TARGETARCH

RUN set -eux; \
    case "${TARGETARCH}" in \
      amd64) CMAKE_ARCH=x86_64 ;; \
      arm64) CMAKE_ARCH=aarch64 ;; \
      *) echo "unsupported TARGETARCH=${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/cmake.tar.gz \
      "https://github.com/Kitware/CMake/releases/download/v${CMAKE_VERSION}/cmake-${CMAKE_VERSION}-linux-${CMAKE_ARCH}.tar.gz"; \
    tar -xzf /tmp/cmake.tar.gz -C /opt; \
    ln -sf /opt/cmake-${CMAKE_VERSION}-linux-${CMAKE_ARCH}/bin/cmake /usr/local/bin/cmake; \
    ln -sf /opt/cmake-${CMAKE_VERSION}-linux-${CMAKE_ARCH}/bin/ctest /usr/local/bin/ctest; \
    rm /tmp/cmake.tar.gz

WORKDIR /build

COPY vendor/openafis /build/openafis
COPY iip_openafis_identify.cpp /build/

WORKDIR /build/openafis
# Build library only (skip openafis-cli; LTO can fail on arm64 Docker)
RUN cmake . -DCMAKE_BUILD_TYPE=Release -DCMAKE_INTERPROCEDURAL_OPTIMIZATION=OFF \
    && cmake --build . --target openafis -j"$(nproc)"

RUN g++ -std=c++17 -O3 -static-libstdc++ \
    -I/build/openafis/lib \
    /build/iip_openafis_identify.cpp \
    -L/build/openafis/lib -lopenafis -lpthread \
    -o /build/iip-openafis-identify

FROM debian:bookworm-slim

COPY --from=builder /build/iip-openafis-identify /usr/local/bin/iip-openafis-identify

RUN mkdir -p /data/templates

ENV OPENAFIS_TEMPLATES_DIR=/data/templates
VOLUME ["/data/templates"]

CMD ["sleep", "infinity"]
