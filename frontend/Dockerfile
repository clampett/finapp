FROM node:24-alpine

WORKDIR /app

# Install all core project dependencies
COPY package*.json ./
RUN npm ci

# Copy everything else first so we have access to all subpackages
COPY . .

# Install dev dependencies in subdirectories before building
RUN cd landing && npm ci
RUN cd dashboard && npm ci

# Now build everything  
RUN npm run build

EXPOSE 8080

CMD npm run dev