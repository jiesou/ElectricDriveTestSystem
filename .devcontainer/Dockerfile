FROM docker.io/denoland/deno:bin-2.7.14 AS deno
FROM mcr.microsoft.com/devcontainers/typescript-node:24
COPY --from=deno /deno /usr/local/bin/deno
