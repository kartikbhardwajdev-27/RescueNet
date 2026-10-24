import { ClipboardList, Info, WifiOff } from "lucide-react";
import Card from "@/components/Card";
import PageHeader from "@/components/PageHeader";
import { CREDITS, HOW_IT_WORKS, KNOWN_LIMITS, TECH_STACK, WHO_CAN_DO_WHAT } from "@/components/about/aboutData";

export const metadata = { title: "About" };

const H2 = "font-display text-2xl font-bold tracking-tight";

// Static: no data and no requests, so it opens with no connection.
export default function AboutPage() {
  return (
    <>
      <PageHeader
        title="About"
        description="RescueNet helps people report emergencies, find shelter and coordinate help, even when the internet is down."
      />

      <div className="flex flex-col gap-10">
        <section aria-labelledby="what-heading">
          <h2 id="what-heading" className={H2}>
            What RescueNet is
          </h2>
          <p className="mt-3 max-w-3xl leading-relaxed text-ink-muted">
            A disaster-response app for one local area. Anyone can report an incident or send an SOS. Organizations such
            as NGOs, volunteer groups and government teams can see what is happening on a live map, keep shelter
            capacity up to date, mark incidents as in progress or resolved, and post events like volunteer drives and
            donation camps. It is built to run on a laptop in the field, with no internet.
          </p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-3">
            {WHO_CAN_DO_WHAT.map(({ who, does }) => (
              <li key={who}>
                <Card lift={false} className="h-full">
                  <h3 className="font-display text-lg font-bold">{who}</h3>
                  <p className="mt-1.5 text-sm text-ink-muted">{does}</p>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="offline-heading">
          <h2 id="offline-heading" className={`${H2} flex items-center gap-2.5`}>
            <WifiOff className="size-6 text-info" aria-hidden="true" />
            How it works offline
          </h2>
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {HOW_IT_WORKS.map(({ title, body }) => (
              <li key={title}>
                <Card lift={false} className="h-full">
                  <h3 className="font-display text-lg font-bold">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{body}</p>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="stack-heading">
          <h2 id="stack-heading" className={H2}>
            Tech stack
          </h2>
          <Card lift={false} className="mt-4">
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {TECH_STACK.map(({ name, detail }) => (
                <div key={name}>
                  <dt className="font-semibold">{name}</dt>
                  <dd className="mt-0.5 text-sm text-ink-muted">{detail}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </section>

        <section aria-labelledby="limits-heading">
          <h2 id="limits-heading" className={H2}>
            Known limits
          </h2>
          <p className="mt-1 text-sm text-ink-muted">What RescueNet does not do, so nobody has to find out the hard way.</p>
          <Card lift={false} className="mt-4">
            <ul className="flex flex-col gap-3">
              {KNOWN_LIMITS.map((limit) => (
                <li key={limit} className="flex gap-3 text-sm leading-relaxed">
                  <Info className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" />
                  <span>{limit}</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        {/*
          TODO (Kartik): fill in the project and team details below before the demo.
          Nothing here was invented on purpose. Suggested content: project name or
          course, the names and roles of the people who built it, the institution,
          a contact address, and any thanks. Replace the whole <section> with plain
          text once you have it; the "To be added" box is only a marker so the gap
          is obvious.
        */}
        <section aria-labelledby="team-heading">
          <h2 id="team-heading" className={H2}>
            Team and project
          </h2>
          <div
            role="note"
            className="mt-4 flex items-start gap-3 rounded-card border border-dashed border-warn/60 bg-warn/5 p-5 text-sm"
          >
            <ClipboardList className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden="true" />
            <div>
              <p className="font-bold text-warn">TODO: to be added</p>
              <p className="mt-1 text-ink-muted">Team members and roles, institution or course, and a contact address.</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="credits-heading">
          <h2 id="credits-heading" className={H2}>
            Credits
          </h2>
          <ul className="mt-3 flex flex-col gap-1.5 text-sm text-ink-muted">
            {CREDITS.map((credit) => (
              <li key={credit}>{credit}</li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
