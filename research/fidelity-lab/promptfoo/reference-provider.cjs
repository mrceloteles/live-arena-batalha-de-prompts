module.exports = {
  id: () => 'source-package-reference',
  callApi: async (_prompt, context) => ({ output: String(context.vars.expected_percent) }),
};
