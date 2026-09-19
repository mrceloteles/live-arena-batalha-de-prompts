# Laboratório de fidelidade do motor

Este laboratório mantém três trilhas independentes:

- `golden/`: observações independentes usadas como verdade de regressão;
- `promptfoo/`: matriz entre a referência preservada e o candidato atual;
- `aalpy/`: inferência da máquina de estados do motor por consultas e resets;
- `evidence/`: respostas normalizadas obtidas do site-base pela interface pública.

Nenhuma trilha importa a outra. Elas se apoiam por artefatos versionados. Consulte `RESULTS-2026-09-04.md` para o resultado e os limites atuais.
