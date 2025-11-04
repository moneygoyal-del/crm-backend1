# --- Stage 1: Build the React App ---
    FROM node:20-alpine AS builder
    WORKDIR /app
    
    COPY package*.json ./
    RUN npm install
    
    COPY . .
    #
    RUN npm run build
    
    # --- Stage 2: Serve with Nginx ---
    FROM nginx:1.25-alpine
    
    # Copy the built static files from the 'builder' stage
    COPY --from=builder /app/dist /usr/share/nginx/html
    
    # Copy our custom Nginx config (we'll create this next)
    COPY nginx.conf /etc/nginx/conf.d/default.conf
    
    # Expose the default Nginx port
    EXPOSE 80