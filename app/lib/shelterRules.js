// Shelter rules shared by the model, the server validation and the browser
// forms. Pure and dependency-free (the model itself imports mongoose, which
// must never end up in a browser bundle).

export const SHELTER_STATUSES = ["open", "full", "closed"];

export const MAX_SHELTER_CAPACITY = 100_000;
export const MAX_SHELTER_NAME_LENGTH = 120;
export const MAX_SHELTER_ADDRESS_LENGTH = 300;

// Digits plus the usual phone punctuation, 5 to 30 characters.
export const PHONE_PATTERN = /^[0-9+()\-.\s]{5,30}$/;
