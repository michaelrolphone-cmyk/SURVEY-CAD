const PRINT_SCALES = Object.freeze([1, 5, 10, 20, 30, 40, 50, 100, 200, 500, 1000]);

const PAPER_SIZES_MM = Object.freeze({
  A0: Object.freeze({ widthMm: 1189, heightMm: 841 }),
  A1: Object.freeze({ widthMm: 841, heightMm: 594 }),
  A2: Object.freeze({ widthMm: 594, heightMm: 420 }),
  A3: Object.freeze({ widthMm: 420, heightMm: 297 }),
  A4: Object.freeze({ widthMm: 297, heightMm: 210 })
});

function mmToInches(mm) {
  return Number(mm) / 25.4;
}

export function resolveLandscapePaperSizeInches({ preset = 'A3', customWidthMm = 420, customHeightMm = 297 } = {}) {
  if (preset === 'custom') {
    const width = mmToInches(customWidthMm);
    const height = mmToInches(customHeightMm);
    return {
      widthIn: Math.max(width, height),
      heightIn: Math.min(width, height)
    };
  }

  const selected = PAPER_SIZES_MM[preset] || PAPER_SIZES_MM.A3;
  return {
    widthIn: mmToInches(selected.widthMm),
    heightIn: mmToInches(selected.heightMm)
  };
}

export function chooseClosestPrintScale({ worldWidthFeet, worldHeightFeet, paperWidthIn, paperHeightIn, marginIn = 0.5 }) {
  const printableWidthFeet = Math.max(1e-6, (paperWidthIn - marginIn * 2) / 12);
  const printableHeightFeet = Math.max(1e-6, (paperHeightIn - marginIn * 2) / 12);
  const target = Math.max(worldWidthFeet / printableWidthFeet, worldHeightFeet / printableHeightFeet);
  let bestScale = PRINT_SCALES[0];
  let bestError = Infinity;
  for (const scale of PRINT_SCALES) {
    const error = Math.abs(scale - target);
    if (error < bestError) {
      bestError = error;
      bestScale = scale;
    }
  }
  return {
    selectedScale: bestScale,
    targetScale: target,
    scales: PRINT_SCALES
  };
}

export { PAPER_SIZES_MM, PRINT_SCALES };
