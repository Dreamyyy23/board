export const BOARD_SIZE = 36;

export const SPACE_KINDS = Array.from({ length: BOARD_SIZE }, (_, index) => {
  if (index === 0) return "hearth";
  if ([3, 15, 27].includes(index)) return "relic";
  if ([6, 18, 30].includes(index)) return "archive";
  if ([8, 20, 32].includes(index)) return "council";
  if ([9, 21, 33].includes(index)) return "oracle";
  if ([12, 24].includes(index)) return "key";
  if ([5, 11, 17, 23, 29, 35].includes(index)) return "rift";
  if ([4, 10, 16, 22, 28, 34].includes(index)) return "snare";
  return "echo";
});

export const KIND_MARKS: Record<string, string> = {
  hearth: "◆",
  echo: "·",
  relic: "◇",
  archive: "▣",
  council: "6",
  oracle: "?",
  key: "⚿",
  rift: "✦",
  snare: "×",
};

export const KIND_NAMES: Record<string, string> = {
  hearth: "Hearth",
  echo: "Echo",
  relic: "Relic",
  archive: "Archive",
  council: "Council",
  oracle: "Oracle",
  key: "Alabaster Key",
  rift: "Rift",
  snare: "Snare",
};

export const BOARD_POINTS = Array.from({ length: BOARD_SIZE }, (_, index) => {
  const angle = ((92 - index * 34) * Math.PI) / 180;
  const radius = 43.5 - index * 0.68;
  return {
    x: 50 + Math.cos(angle) * radius,
    y: 48.4 + Math.sin(angle) * radius,
  };
});
