#!/usr/bin/env node
import { SurveyCadClient } from "./survey-api.js";

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i++;
      }
    } else out._.push(a);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  const client = new SurveyCadClient();

  if (!cmd || args.help) {
    console.log(`Usage:
  node src/cli.js lookup --address "1600 W Front St, Boise"
  node src/cli.js section --lat 43.61 --lon -116.20
  node src/cli.js aliquots --lat 43.61 --lon -116.20`);
    process.exit(0);
  }

  if (cmd === "lookup") {
    if (!args.address) throw new Error("--address is required");
    console.log(JSON.stringify(await client.lookupByAddress(args.address), null, 2));
    return;
  }

  const lat = Number(args.lat);
  const lon = Number(args.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error("--lat and --lon are required numeric values");
  }

  if (cmd === "section") {
    console.log(JSON.stringify(await client.loadSectionAtPoint(lon, lat), null, 2));
    return;
  }

  if (cmd === "aliquots") {
    const section = await client.loadSectionAtPoint(lon, lat);
    if (!section) throw new Error("No containing section found.");
    const aliquots = await client.loadAliquotsInSection(section);
    console.log(JSON.stringify({ section, aliquots }, null, 2));
    return;
  }

  throw new Error(`Unknown command: ${cmd}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
