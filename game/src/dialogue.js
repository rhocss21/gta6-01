// SOLMAR CITY — the voices in Jax's ear. Mara Voss is the fixer he owes
// $50,000; Mira drives, Lio wrenches, and Tia Rosa runs Radio Mango. Each
// job has one line per step, so the dialogue box always talks about the job
// that is on screen right now.
export const SPEAKERS = {
  mara: { name: 'MARA VOSS', role: 'FIXER', color: '#ffd34d', initial: 'M' },
  mira: { name: 'MIRA', role: 'DRIVER · CREW', color: '#9fd8ff', initial: 'M' },
  lio: { name: 'LIO', role: 'MECHANIC · CREW', color: '#7dff9a', initial: 'L' },
  rosa: { name: 'TIA ROSA', role: 'RADIO MANGO', color: '#ff9ecf', initial: 'R' },
};

// [speaker, line] per job index; one line per step inside the job.
const JOB_LINES = {
  0: [
    ['mara', "Any car on Palm Row, Jax. Take it quiet, bring it to the Garage — and don't scratch my paint."],
    ['lio', "She's in the bay, plates swapped already. Drive it like you stole it — because you did."],
  ],
  1: [
    ['mara', 'The package is at the docks, Pier 3. Pick it up and do NOT open it. Some things you don\'t look at.'],
    ['mira', "PD is thick on the coast road tonight. I've got a cut-through past the palms — follow my markers."],
  ],
  2: [
    ['mara', 'Three stars, Jax. Make some noise, then disappear. If they catch you, the debt doubles.'],
    ['lio', "Lose the tail and the heat dies with it. Alleys, not highways — your car can't outrun a radio."],
  ],
  3: [
    ['mira', 'Four checkpoints, beach road, ninety seconds. The Calyx can do it — the question is can you?'],
    ['mara', 'Beat the clock and the coast pays double. Miss it and we start the whole run again.'],
  ],
  4: [
    ['mara', 'Three shops. Liquor, Palm Row, Coast Mart. In and out, no heroes — then come home to me.'],
    ['rosa', 'And remember, cariño — the register is the job. The people are not. Keep it clean.'],
  ],
};

export function lineFor(jobIndex, step) {
  const lines = JOB_LINES[jobIndex] || JOB_LINES[0];
  const [who, line] = lines[Math.min(step || 0, lines.length - 1)];
  return { speaker: SPEAKERS[who], line };
}

// The cover-shot line: the chase starts on foot, and Mara says so.
export const COVER_LINE = {
  speaker: SPEAKERS.mara,
  line: 'You took the Calyx on foot, Jax — now GET IN and lose them. Air One has you in the light!',
};

// Crew cards for the HUD: name, role, and the perk each one brings.
export const CREW = [
  { name: 'MIRA', role: 'DRIVER', perk: 'SWAP PLATES', color: '#9fd8ff' },
  { name: 'LIO', role: 'MECHANIC', perk: 'QUICK FIX', color: '#7dff9a' },
];

export const STATIONS = [
  { name: 'RADIO MANGO 98.6', song: 'Guava Sunrise — Los Palmitos' },
  { name: 'RADIO MANGO 98.6', song: 'Neon Tide — Coral Static' },
  { name: 'WAVE 104.1', song: 'Midnight Ferry — The Breakers' },
];
