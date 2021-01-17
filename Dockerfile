# installs cni-store-proxy into the container image of CUBE
# so that both backend servers can run in the same container
#
#    docker build -t fnndsc/cni-store-proxy:and-cube .

FROM fnndsc/chris:latest

USER root
RUN apt-get update \
    && apt-get install -qq yarnpkg jq \
    && rm -rf /var/lib/apt/lists/*

USER localuser
COPY --chown=localuser . /app
WORKDIR /app
RUN yarnpkg

ENTRYPOINT ["/app/docker-entrypoint.sh"]
EXPOSE 8011
