// What the API shows other people about incidents and shelters.
//
// Both records carry the id of the account that made them (`reportedBy`,
// `createdBy`). Those ids stay in the database, where permission checks use
// them, but they are never sent: a stranger could otherwise tell which reports
// came from the same person. Instead each record says whether it is the
// viewer's own (`isMine`), worked out here from the viewer's login.

const plain = (record) => (typeof record.toObject === "function" ? record.toObject() : record);
const sameId = (a, b) => Boolean(a && b && String(a) === String(b));

// -> the incident without reportedBy and clientId, plus isMine
export function toPublicIncident(incident, viewerId) {
  const { reportedBy, clientId, ...rest } = plain(incident);
  void clientId;
  return { ...rest, isMine: sameId(reportedBy, viewerId) };
}

// -> the shelter without createdBy, plus isMine (the viewer's organization added it)
export function toPublicShelter(shelter, viewerId) {
  const { createdBy, ...rest } = plain(shelter);
  return { ...rest, isMine: sameId(createdBy, viewerId) };
}
