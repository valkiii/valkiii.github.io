// Fruit kinds: size relative to the base radius, juice colour for splats and particles.
export const KINDS = {
  watermelon: { size: 1.32, juice: '#e8203a', weight: 1 },
  orange:     { size: 1.0,  juice: '#ff9a1a', weight: 1.2 },
  lemon:      { size: 0.95, juice: '#ffe23a', weight: 1 },
  apple:      { size: 0.98, juice: '#fff0c4', weight: 1.2 },
  kiwi:       { size: 0.86, juice: '#8fd42a', weight: 1 },
  plum:       { size: 0.84, juice: '#c22a72', weight: 1 },
  coconut:    { size: 1.12, juice: '#f4f1ea', weight: 0.6 },
};
export const FRUIT_NAMES = Object.keys(KINDS);
