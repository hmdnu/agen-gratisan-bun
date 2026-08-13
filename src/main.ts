import { runBot } from "./bot.js";
import { errorMessage } from "./util/guards.js";

async function main(): Promise<void> {
  try {
    await runBot();
    process.exit(0);
  } catch (err) {
    console.error(errorMessage(err));
    process.exit(1);
  }
}

void main();
