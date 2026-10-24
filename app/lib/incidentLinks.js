// Where an incident's own page lives. One place, so Home, the account page and
// the detail page itself agree. (The map has its own deep link: lib/mapFocus.js.)
export const incidentHref = (id) => `/incidents/${id}`;
