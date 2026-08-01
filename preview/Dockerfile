FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html places.html reconciliation.html /usr/share/nginx/html/
COPY assets/ /usr/share/nginx/html/assets/
COPY dist/ /usr/share/nginx/html/dist/
COPY data/ /usr/share/nginx/html/data/

EXPOSE 3457

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3457/healthz >/dev/null || exit 1
