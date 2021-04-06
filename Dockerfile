FROM node:15-alpine

WORKDIR /app
COPY . .

RUN yarn

USER 15000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
EXPOSE 8011
