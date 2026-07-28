# Talent Battle — one image that runs the whole app with all 4 languages.
FROM node:22-bookworm-slim

# Install the compilers/runtimes the judge needs: C, C++, Java, Python.
RUN apt-get update && apt-get install -y --no-install-recommends \
      gcc g++ default-jdk python3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

# The app has no npm dependencies — it uses Node's built-in modules only.
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server/server.js"]
