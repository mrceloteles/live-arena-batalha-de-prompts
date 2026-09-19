module.exports = {
  id: () => 'current-source-fallback',
  callApi: async (_prompt, context) => {
    const { evaluateGoldenCase } = await import('./candidate-core.mjs');
    return { output: String(evaluateGoldenCase(context.vars)) };
  },
};
