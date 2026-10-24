// Height of the map card, shared by the real map and its loading skeleton so the
// page does not jump when the map code arrives.
//
// The map should fill the screen without the page itself scrolling (a scrolling
// page fights with dragging the map). Those numbers come from app/layout.js:
//   under md   <main> has pt-24 + pb-32 and the container p-4 (sm: p-6)
//   md and up  no top/bottom padding on <main>, container p-8, sidebar at the left
// Under md the card also reaches down into <main>'s bottom padding (negative
// margin), so it ends just above the floating tab bar instead of 128px from the
// bottom, and the page still totals exactly one screen.
export const MAP_CARD_SIZE =
  "h-[calc(100dvh-13rem)] min-h-80 -mb-12 sm:h-[calc(100dvh-13.5rem)] sm:-mb-14 md:mb-0 md:h-[calc(100dvh-4rem)]";
