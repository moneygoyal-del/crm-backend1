# backend/Dockerfile

# Use a lean base image for production
FROM node:20-alpine 

# Create and set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies (excluding devDependencies like prettier, nodemon)
RUN npm install --omit=dev

# Copy the rest of the application code
COPY . .

# The application runs on port 8000 (default)
EXPOSE 8000

# Run the production start command
CMD ["npm", "start"]