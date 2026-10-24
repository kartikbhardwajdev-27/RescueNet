# Suggested priority

RescueNet reads the description of a report and **suggests** how serious it
sounds. It is a short list of keywords and a sum, nothing more: no learning, no
online service, no guessing beyond the words. Everyone sees it labelled
"Suggested priority" and a person always decides.

All paths are relative to `app/`.

## Where the keywords are

The full list, with the weight of each group, is at the top of `lib/triage.js`
(`KEYWORD_GROUPS`). Edit it there; nothing else needs to change. It includes the
English words from the plan (trapped, bleeding, unconscious, collapse, drowning,
fire, gas, child, elderly, pregnant, no water, stuck) and some Hindi and Hinglish
ones (aag, bachao, baadh, ghayal, phans, and a few in Devanagari script).

How it adds up:

- A group counts **once**, however many of its words appear. Its weight is added.
- The total is capped at 100. **70+** suggests critical, **35+** high, **15+**
  medium, anything above 0 low, and 0 suggests nothing.
- A word right after "no", "not", "nobody" or "without" (or just before "nahi")
  does not count, and negation stops at a full stop or comma: "No water. A child
  is stuck" still counts the child.
- Words match whole, in any case: "fireworks" is not "fire".

## Where it shows

| Place | What happens |
| --- | --- |
| Report form | While you type, a blue chip says "Suggested priority: High, because it mentions 'trapped'" with an **Apply** button. It only appears when the words sound **more** serious than the level you picked (it never nags you to go down). Works offline: the rules run in the browser. |
| Server | `POST /api/incidents` and `POST /api/sos` work out the score again from the stored text and save `triage: { score, reasons }`. A `triage` sent by a client is ignored. |
| Incident page | If the description earned any keywords, a "Suggested priority" note lists them. Older incidents have no `triage` and show nothing. |
| API | `GET /api/incidents?sort=priority` orders open incidents by `severity weight + triage score + SOS bonus` (low 0, medium 25, high 50, critical 75; SOS +50), newest first on ties, and puts resolved incidents last. The default order (`sort=recent`) is unchanged. |

## Check it

```sh
npm run check:triage     # 220 checks of the scoring rules; prints OK or every failure
```

## Limits

- It does not understand meaning. "My child is safe, no fire" is read word by
  word; it copes with the simple "no ..." case and not much else.
- Other languages and spellings are not covered unless listed.
- The reporter's own severity still counts; the score never lowers anything.
