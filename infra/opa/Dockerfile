# Native OPA image for Apple Silicon (arm64) and Intel (amd64).
# The stock openpolicyagent/opa:0.63.0 tag is amd64-only and runs under emulation on Mac.
FROM alpine:3.20

ARG OPA_VERSION=0.63.0
ARG TARGETARCH

RUN apk add --no-cache ca-certificates wget \
    && case "${TARGETARCH}" in \
         amd64|arm64) OPA_ARCH="${TARGETARCH}" ;; \
         *) OPA_ARCH="$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')" ;; \
       esac \
    && wget -qO /usr/local/bin/opa \
         "https://github.com/open-policy-agent/opa/releases/download/v${OPA_VERSION}/opa_linux_${OPA_ARCH}_static" \
    && chmod +x /usr/local/bin/opa \
    && apk del wget

WORKDIR /policies
EXPOSE 8181

HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8181/health || exit 1

ENTRYPOINT ["opa"]
CMD ["run", "--server", "--addr=0.0.0.0:8181", "--log-format=json", "/policies"]
