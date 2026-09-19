// Sobe o servidor de PRODUÇÃO em outro processo e, depois do tempo pedido,
// aciona o mesmo encerramento que o `SIGTERM` aciona.
//
// Por que existe: o Windows não entrega `SIGTERM` a outro processo — a chamada
// vira termino imediato, sem handler nenhum rodar (medido: `exit -> {codigo:
// null, sinal: 'SIGTERM'}` com o handler intacto, nunca chamado). Sem este
// gatilho, o teste de encerramento gracioso simplesmente não teria como rodar na
// máquina de quem desenvolve; e o que ele testa continua sendo a fiação de
// produção: `startServer`, o portão de drenagem, o hub e o fechamento do banco.
// O único pedaço trocado é o disparo.
//
// `SIGTERM` de verdade continua coberto por um teste próprio, que roda onde o
// sinal existe (o CI é Linux).
import { startServer } from '../../src/server/start.mjs';

const app = await startServer();
setTimeout(() => app.desligar('SIGTERM'), Number(process.env.DESLIGAR_EM_MS || 700));
