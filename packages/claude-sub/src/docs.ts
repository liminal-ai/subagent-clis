import process from "node:process";
import { getTopic, listTopics } from "./docs-content.js";

export function printDocs(topic?: string): void {
  if (!topic) {
    process.stdout.write(listTopics());
    return;
  }

  const body = getTopic(topic);
  if (!body) {
    process.stdout.write(
      `Unknown docs topic: ${topic}\n\n${listTopics()}`,
    );
    process.exit(1);
  }

  process.stdout.write(body);
  if (!body.endsWith("\n")) {
    process.stdout.write("\n");
  }
}
