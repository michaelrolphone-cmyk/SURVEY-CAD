#!/usr/bin/env node
import fs from 'node:fs/promises';
import { extractBasisFromPdf } from './extractor.js';

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      out._.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function usage() {
  return `Usage:
  node src/ros-basis-cli.js --pdf /path/to/file.pdf [--maxPages 2] [--dpi 300] [--debug]

Options:
  --pdf       Path to ROS PDF file (required)
  --maxPages  Max pages to scan (default 2)
  --dpi       Render DPI for OCR (default 300)
  --debug     Include OCR diagnostics in output`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h || !args.pdf) {
    console.log(usage());
    process.exit(args.pdf ? 0 : 1);
  }

  await fs.access(args.pdf);
  const result = await extractBasisFromPdf(args.pdf, {
    maxPages: Number(args.maxPages || 2),
    dpi: Number(args.dpi || 300),
    debug: Boolean(args.debug),
  });

  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

export { parseArgs, main };
