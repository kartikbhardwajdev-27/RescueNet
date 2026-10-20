// Incident enums shared by the model, the server validation and the browser
// forms. Pure and dependency-free (the model itself imports mongoose, which
// must never end up in a browser bundle).

export const INCIDENT_TYPES = ["flood", "fire", "earthquake", "medical", "other"];
export const INCIDENT_SEVERITIES = ["low", "medium", "high", "critical"];
export const INCIDENT_STATUSES = ["reported", "in_progress", "resolved"];

export const MAX_DESCRIPTION_LENGTH = 1000;
