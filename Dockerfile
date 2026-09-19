FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/descubra-o-prompt.sqlite

WORKDIR /app

# Dependencias primeiro (e so os manifestos): a camada so muda quando eles
# mudam, e nenhum artefato local entra por aqui.
COPY package.json package-lock.json ./
# Instala apenas dependencias de producao (puppeteer e dev-only).
RUN npm ci --omit=dev --no-audit --no-fund

# O que a aplicacao de fato serve e carrega:
#   src/  — o servidor, incluindo o `schema.sql` lido em tempo de execucao;
#   public/ — os assets servidos por /assets.
# COPY seletivo, e nao `COPY . .`: o contexto local tem capturas e saidas de QA
# (tmp/, output/, arena/) que nao pertencem a imagem. O `.dockerignore` tambem
# cobre isso — aqui e a segunda barreira.
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
COPY --chown=node:node LICENSE-NOTICE.md ./

RUN mkdir -p /data && chown node:node /data
USER node

EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "src/server/start.mjs"]
