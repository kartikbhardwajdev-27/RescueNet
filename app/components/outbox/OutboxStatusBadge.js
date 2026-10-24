import { CircleAlert, CircleCheck, Clock, LoaderCircle } from "lucide-react";
import { toneClasses } from "@/components/home/tones";

// Amber = waiting or trouble, blue = information (sending, delivered). Red is
// left to emergencies, so a failed item is amber too.
const STATUS_META = {
  queued: { label: "Queued", tone: "amber", Icon: Clock },
  sending: { label: "Sending", tone: "blue", Icon: LoaderCircle, spin: true },
  sent: { label: "Sent", tone: "blue", Icon: CircleCheck },
  failed: { label: "Not sent", tone: "amber", Icon: CircleAlert },
};

export default function OutboxStatusBadge({ status }) {
  const { label, tone, Icon, spin } = STATUS_META[status] ?? STATUS_META.queued;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${toneClasses(tone).badge}`}>
      <Icon className={`size-3.5 ${spin ? "motion-safe:animate-spin" : ""}`} aria-hidden="true" />
      {label}
    </span>
  );
}
