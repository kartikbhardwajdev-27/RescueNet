// The words on the Resources page. Plain data, so the whole page is static and
// opens with no internet or server.

// TODO: verify these numbers before the demo.
// They are the Indian national emergency numbers as the author knows them:
//   112  single emergency number (police, fire, ambulance)
//   100  police
//   101  fire
//   108  ambulance / medical emergency (run by state governments; in a few
//        states the ambulance number is different)
// Confirm each one is right for the place the demo is shown, and that 108 works
// there. Only these four are listed on purpose: do not add others unchecked.
export const EMERGENCY_NUMBERS = [
  { number: "112", label: "National emergency number", detail: "One number for police, fire and ambulance. Start here if unsure.", primary: true },
  { number: "100", label: "Police", detail: "Crime, danger from other people, missing persons." },
  { number: "101", label: "Fire", detail: "Fire, smoke, gas leak, rescue from a collapsed building." },
  { number: "108", label: "Ambulance", detail: "Medical emergency, serious injury, someone unconscious." },
];

export const GENERAL_GUIDANCE_NOTE = "General guidance. Follow instructions from local authorities.";

// Each guide: a title, one line that says what it is for, and short steps.
// Kept conservative on purpose: well-known basic steps only, and no medicine
// names or doses anywhere. `icon` keys into the page (lucide-react icons).
export const GUIDES = [
  {
    id: "flood",
    icon: "waves",
    title: "Flood",
    summary: "Water is rising or has entered your area.",
    steps: [
      "Move to higher ground early. Do not wait for the water to reach you.",
      "Never walk, swim or drive through floodwater. About 15 cm (6 in) of moving water can knock an adult over, and about 60 cm (2 ft) can carry a car away.",
      "If it is safe and your hands and feet are dry, switch off the electricity at the main switch. Stay away from fallen power lines and wet electrical items.",
      "Take drinking water, your phone and charger, a torch, important papers and any regular medicines.",
      "Floodwater can carry sewage. Do not drink it or play in it, and boil or purify water before drinking if the supply may be contaminated.",
      "Go back home only when the authorities say it is safe.",
    ],
  },
  {
    id: "fire",
    icon: "flame",
    title: "Fire",
    summary: "Fire or heavy smoke in a building or nearby.",
    steps: [
      "Get out and stay out. Warn others as you leave, then call 101 or 112 from a safe place outside.",
      "Use the stairs, never a lift.",
      "Smoke rises, so stay low where the air is clearer.",
      "Before opening a door, touch it with the back of your hand. If it is hot, do not open it.",
      "If you cannot get out, close the door, block the gaps with wet cloth, go to a window and signal for help.",
      "If your clothes catch fire: stop, drop to the ground, cover your face and roll.",
      "Do not go back inside for belongings. Only tackle a very small fire if you are sure it is safe and your way out is behind you. If in doubt, leave.",
      "If you smell gas: do not touch switches or light a flame, open windows if you can, and leave.",
    ],
  },
  {
    id: "earthquake",
    icon: "activity",
    title: "Earthquake",
    summary: "The ground is shaking.",
    steps: [
      "Drop to your hands and knees, cover your head and neck under a sturdy table or with your arms, and hold on until the shaking stops.",
      "Stay where you are. Do not run outside while the ground is shaking and do not use a lift.",
      "In bed: stay there and protect your head with a pillow.",
      "Outdoors: move away from buildings, trees, streetlights and power lines, then drop and cover.",
      "In a vehicle: stop in a clear spot and stay inside with your seatbelt on.",
      "Afterwards expect aftershocks. Check yourself and others for injuries, and leave a damaged building carefully.",
      "If you smell gas, leave at once. Use text messages rather than calls where you can, to keep phone lines free for emergencies.",
    ],
  },
  {
    id: "first-aid",
    icon: "heart-pulse",
    title: "Basic first aid",
    summary: "Until help arrives. This does not replace a first-aid course.",
    steps: [
      "Check for danger first (traffic, fire, live wires). Do not put yourself at risk. Call 108 or 112.",
      "Heavy bleeding: press firmly on the wound with a clean cloth and keep pressing. If the cloth soaks through, add more on top rather than lifting it.",
      "Not responding and not breathing normally: call 108 or 112 and, if you are trained, start CPR (hard, fast pushes in the centre of the chest) until help arrives.",
      "Responding but not moving, or you suspect a broken bone or a neck or back injury: keep them still and warm, and do not move them unless they are in danger.",
      "Burns: cool the burn under cool running water for at least 10 minutes. Do not use ice, butter or creams. Cover it loosely with a clean, non-fluffy cloth.",
      "Unconscious but breathing: lay them on their side so they can breathe, and stay with them.",
      "Do not give food, drink or any medicine to someone who is badly hurt or drowsy.",
    ],
  },
];
