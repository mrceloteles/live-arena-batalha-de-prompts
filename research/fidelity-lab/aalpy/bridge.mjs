import readline from 'node:readline';
import { createClassicHarness } from './classic-harness.mjs';

const harness = createClassicHarness();
const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

for await (const line of lines) {
  try {
    const command = JSON.parse(line);
    let result;
    if (command.command === 'actions') result = harness.actions();
    else if (command.command === 'reset') result = await harness.reset();
    else if (command.command === 'step') result = await harness.step(command.action);
    else result = { error: 'unknown_command' };
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ error: String(error?.message || error) })}\n`);
  }
}

harness.close();
