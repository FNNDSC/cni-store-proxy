FROM node:15-alpine

WORKDIR /app
COPY . .

RUN yarn

USER 15000

CMD ["yarn", "run", "serve"]
EXPOSE 8011
