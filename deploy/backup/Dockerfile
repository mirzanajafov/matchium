FROM postgres:17-alpine
RUN apk add --no-cache rsync coreutils
COPY backup.sh /usr/local/bin/backup
RUN chmod +x /usr/local/bin/backup
HEALTHCHECK --interval=10m CMD ["backup", "check"]
ENTRYPOINT ["backup"]
