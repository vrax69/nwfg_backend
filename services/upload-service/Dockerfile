FROM node:20-slim

# Instalar dependencias necesarias para algunas librerías de node si fuera necesario
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 4005

CMD ["npm", "start"]