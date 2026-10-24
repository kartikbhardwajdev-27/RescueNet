import MapLoader from "@/components/map/MapLoader";

export const metadata = { title: "Map" };

export default function MapPage() {
  return (
    <>
      <h1 className="sr-only">Map</h1>
      <MapLoader />
    </>
  );
}
