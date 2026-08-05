# Aexy Postgres image: stock postgres:18-alpine + pgvector extension.
#
# Why a custom image: keeping the alpine base preserves the postgres user UID
# and the libc collations the existing data volume was created with. A switch
# to the official pgvector/pgvector:pg18 image (Debian) would require a
# pg_dump/restore cycle to avoid UID and libc collation issues.
#
# pgvector v0.8.1 is the first tag with PostgreSQL 18 support — earlier tags
# fail to compile against the v18 headers.

FROM postgres:18-alpine

ARG PGVECTOR_VERSION=v0.8.1

# postgres:18-alpine is a floating tag: the base drifts to newer Alpine
# releases over time, and each release ships a different default LLVM. pgvector's
# JIT bitcode must be built with the SAME clang/llvm version postgres itself was
# compiled against, so we derive that version from pg_config instead of
# hardcoding it (hardcoding breaks whenever the base image is rebuilt/repulled).
RUN LLVM_MAJOR="$(pg_config --configure | grep -oE 'llvm[0-9]+' | grep -oE '[0-9]+' | head -1)" \
 && echo "Building pgvector against LLVM ${LLVM_MAJOR}" \
 && apk add --no-cache --virtual .build-deps \
        build-base git "clang${LLVM_MAJOR}" "llvm${LLVM_MAJOR}-dev" \
 && cd /tmp \
 && git clone --depth 1 --branch ${PGVECTOR_VERSION} \
        https://github.com/pgvector/pgvector.git \
 && cd pgvector \
 && make OPTFLAGS="" \
 && make install \
 && cd / \
 && rm -rf /tmp/pgvector \
 && apk del .build-deps
