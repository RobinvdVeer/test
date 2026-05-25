FROM node:18-alpine

WORKDIR /app

COPY --chown=node:node package*.json ./

RUN npm ci --omit=dev

COPY --chown=node:node . .

RUN chown -R node:node /app

USER node

EXPOSE 3000

CMD ["npm", "start"]
