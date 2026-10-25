// The Android app's PlatformGate. Replaces components/PlatformGate.js (which
// does nothing) in the app build: nothing else runs until the laptop's address
// has been asked for.
import MobileGate from "@/components/mobile/MobileGate";

export default MobileGate;
