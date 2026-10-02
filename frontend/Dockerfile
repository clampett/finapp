# Simplest working frontend Dockerfile
FROM nginx:alpine

# Copy entire frontend directory to nginx html dir
COPY . /usr/share/nginx/html

# Make sure all files are readable by nginx
RUN chmod -R 755 /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]