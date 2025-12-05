FROM node:20-alpine

WORKDIR /app

# Copiamos package.json primero para aprovechar cache de Docker
COPY package.json ./

RUN npm install

# Copiamos el código fuente
COPY src ./src

# Puerto interno del servicio
EXPOSE 4001

CMD ["npm", "start"]
