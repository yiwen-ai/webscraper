# the available images at https://crawlee.dev/docs/guides/docker-images
# https://hub.docker.com/r/apify/actor-node-playwright-chrome/tags
FROM apify/actor-node-playwright-chrome:18-1.34.3-next

# Copy just package.json and package-lock.json
# to speed up the build using Docker layer cache.
COPY --chown=myuser package*.json ./
COPY --chown=myuser .npmrc ./

# Install NPM packages, skip optional and development dependencies to
# keep the image small. Avoid logging too much and print the dependency
# tree for debugging
RUN npm --quiet set progress=false \
    && npm install --omit=dev --omit=optional --force \
    && echo "Installed NPM packages:" \
    && (npm list --omit=dev --all || true) \
    && echo "Node.js version:" \
    && node --version \
    && echo "NPM version:" \
    && npm --version

# Next, copy the remaining files and directories with the source code.
# Since we do this after NPM install, quick build will be really fast
# for most source file changes.
COPY --chown=myuser dist ./dist/
COPY --chown=myuser config ./config/

ENV NODE_ENV=production
# Run the image.
CMD npm run start:prod --silent