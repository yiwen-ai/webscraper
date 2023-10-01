FROM apify/actor-node-playwright-chrome:20

# the available images at https://crawlee.dev/docs/guides/docker-images
# https://hub.docker.com/r/apify/actor-node-playwright-chrome/tags
# https://github.com/apify/apify-actor-docker/blob/master/node-playwright-chrome/Dockerfile

USER root
RUN npm --quiet set progress=false \
    && npm install -g pnpm \
    && echo "Node.js version:" \
    && node --version

USER myuser
WORKDIR /home/myuser
# Copy just package.json and pnpm-lock.json
# to speed up the build using Docker layer cache.
COPY --chown=myuser package.json ./
COPY --chown=myuser pnpm-lock.yaml ./
COPY --chown=myuser .npmrc ./

RUN pnpm install --prod \
    && echo "Installed NPM packages:" \
    && (pnpm list || true)

# Next, copy the remaining files and directories with the source code.
# Since we do this after NPM install, quick build will be really fast
# for most source file changes.
COPY --chown=myuser dist ./dist/
COPY --chown=myuser config ./config/
COPY --chown=myuser html ./html/

ENV NODE_ENV=production
# Run the image.
CMD pnpm run start:prod --silent
