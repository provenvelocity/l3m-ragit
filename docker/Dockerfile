# syntax=docker/dockerfile:1

FROM debian:bookworm-slim AS fetch
ARG TARGETARCH
ARG CBM_VERSION=0.11.0
ARG CBM_SHA256_AMD64=1f9e8293eb2bc5c05cfa27a7e8fc033da6d729ffad525ccfcdaa3fd606306683
ARG CBM_SHA256_ARM64=d62eeb224d5ee3eba3070938ec62cf1033f10b041ec1c4b2fb67f7aef390cc7b
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && case "$TARGETARCH" in \
      amd64) checksum="$CBM_SHA256_AMD64" ;; \
      arm64) checksum="$CBM_SHA256_ARM64" ;; \
      *) echo "Unsupported architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac \
 && archive="codebase-memory-mcp-linux-${TARGETARCH}-portable.tar.gz" \
 && curl -fsSLo "/tmp/$archive" "https://github.com/DeusData/codebase-memory-mcp/releases/download/v${CBM_VERSION}/$archive" \
 && echo "$checksum  /tmp/$archive" | sha256sum --check \
 && tar -xzf "/tmp/$archive" -C /tmp codebase-memory-mcp LICENSE THIRD_PARTY_NOTICES.md \
 && chmod 0555 /tmp/codebase-memory-mcp \
 && rm -rf /var/lib/apt/lists/* "/tmp/$archive"

FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=fetch /tmp/codebase-memory-mcp /usr/local/bin/codebase-memory-mcp
COPY --from=fetch /tmp/LICENSE /tmp/THIRD_PARTY_NOTICES.md /usr/share/doc/codebase-memory-mcp/
ENV CBM_CACHE_DIR=/cbm-cache
ENTRYPOINT ["codebase-memory-mcp"]
