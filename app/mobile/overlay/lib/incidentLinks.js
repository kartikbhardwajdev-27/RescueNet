// The Android app's incident links. Replaces lib/incidentLinks.js in the app
// build; the two must export the same thing.
//
// The website has a page per id (/incidents/<id>). A static export cannot make a
// page for ids that don't exist yet, so in the app the id travels in the query
// string and one page (app/incidents/view) shows whichever incident it names.
export const incidentHref = (id) => `/incidents/view?id=${encodeURIComponent(id)}`;
