import mongoose from "mongoose";

// GeoJSON Point shared by User, Incident and Shelter. Coordinates are in
// GeoJSON order: [longitude, latitude].
export function isLngLat(coords) {
  return (
    Array.isArray(coords) &&
    coords.length === 2 &&
    coords.every(Number.isFinite) &&
    Math.abs(coords[0]) <= 180 &&
    Math.abs(coords[1]) <= 90
  );
}

const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["Point"], default: "Point", required: true },
    coordinates: {
      type: [Number],
      required: [true, "Coordinates are required: [lng, lat]"],
      // Without this an array path defaults to [], which would hide "missing".
      default: undefined,
      validate: {
        validator: isLngLat,
        message: "Coordinates must be [lng, lat] with lng in -180..180 and lat in -90..90",
      },
    },
  },
  { _id: false },
);

export default pointSchema;
