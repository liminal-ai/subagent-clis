#!/usr/bin/env node
/**
 * Stub cursor-agent that sleeps until killed (for stop command tests).
 */
import { setTimeout as sleep } from "node:timers/promises";

await sleep(3_600_000);
process.exit(0);
