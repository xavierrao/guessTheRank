# Use a lightweight Node.js base image
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (if exists)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build stage complete, start runtime stage
FROM node:18-alpine

WORKDIR /usr/src/app

# Copy only necessary files from builder
COPY --from=builder /usr/src/app .

# Expose the port your app runs on
EXPOSE 3000

# Command to run the application
CMD ["node", "server.js"]