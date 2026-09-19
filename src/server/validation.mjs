export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/**
 * Marca a causa de uma falha convertida em resposta publica.
 *
 * A mensagem do cliente continua sendo a frase segura ("Nao foi possivel
 * avaliar o prompt agora."); a causa anda em `cause`, que nao vai para o corpo
 * da resposta e existe para a linha de log poder dizer o que aconteceu de fato.
 * Sem isto, o log repetia a frase do aluno e nao a do servidor.
 */
export function comCausa(error, cause) {
  if (cause !== undefined) error.cause = cause;
  return error;
}

export function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'Payload JSON invalido.');
  return value;
}

export function text(value, field, { min = 1, max = 4000 } = {}) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw new ApiError(422, 'Revise os campos enviados.', { [field]: `Informe ${field}.` });
  }
  return value.trim();
}

export function integer(value, field, { min, max } = {}) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || (min !== undefined && parsed < min) || (max !== undefined && parsed > max)) {
    throw new ApiError(422, 'Revise os campos enviados.', { [field]: `${field} invalido.` });
  }
  return parsed;
}

export function consent(value) {
  if (![true, 1, '1', 'true', 'on'].includes(value)) {
    throw new ApiError(422, 'Revise os campos enviados.', { lgpd_accept: 'Aceite os termos da LGPD.' });
  }
  return true;
}
