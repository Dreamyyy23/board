# Obscur visual bible

Status: direction defined in native UI; three external style frames remain
`DRAFT / NOT APPROVED`. No cinematic asset may enter production until those
frames are reviewed together.

## Core promise

The table is a physical ritual machine, not a fantasy dashboard. Every visible
effect must answer at least one question: whose authority is active, what can be
chosen, what changed, who was affected, or how close the House is to winning.
If an effect answers none of those questions, remove it.

The native board, tokens, die, destinations, resources, timers, Golden Threads,
Static, votes, captions, and victory progress remain fully usable with every
image, video, and audio asset disabled.

## Approved-in-code visual language

- Materials: smoke-dark lacquered wood, blackened brass road, bone-ivory die,
  oxidized teal accents, worn vellum, restrained glass.
- Camera: near top-down for play, with only enough perspective to reveal
  thickness and physical depth. Major-state art may lower the camera slightly,
  but it must preserve the board silhouette.
- Ordinary light: warm brass from the road, cool cyan at Thresholds, ember red
  only at Teeth and rising Static.
- Static: hairline interference veins spreading from the heart toward the
  perimeter. It is a pressure map, never decorative fog.
- Golden Threads: taut luminous filaments physically anchored between traveler
  tokens. They show relationships, not ambience.
- Masks: heraldic porcelain or enamel sigils, readable at token scale. Avoid
  realistic faces.
- Typography: high-contrast Roman display titles plus compact monospaced
  authority labels. Generated art should reserve clean title zones rather than
  inventing body copy.
- Motion: routine transitions under one second; major transitions two to three
  seconds. Movement uses decisive ease-out timing. Urgency pulses only in the
  final five seconds.

## State palettes

| State | Dominant | Secondary | Meaning |
|---|---|---|---|
| Ordinary turn | blackened brass | ivory + cyan | readable possibility |
| Static Fracture | ember red | dead white interference | shared danger changed the rules |
| Final Orbit | pale gold | cyan thread-light | every remaining choice is final |

## Composition hierarchy

Every frame and runtime layout must preserve this order:

1. active traveler;
2. remaining time;
3. immediate decision;
4. six reachable results;
5. Shared Static and Fractures;
6. qualification requirements;
7. most recent consequence.

The board occupies the largest visual mass. Rails appear attached to the table,
not as floating generic cards.

## Prohibited visual elements

- generic sci-fi HUDs, neon cyberpunk, casino dice, mobile-game gloss;
- tarot-card layouts, parchment overload, gothic cathedral scenery;
- gore, jump-scare faces, realistic masks, tentacles, occult pentagrams;
- particle storms, smoke that covers controls, lens-flare blooms;
- illegible AI-generated rules text or fake UI controls;
- a cinematic crop that hides reachable destinations or Shared Static.

## Three-frame approval gate

Use the website-ready entries in
`docs/HIGGSFIELD-GENERATION-MANIFEST.json`. On `higgsfield.ai`, confirm the
Unlimited toggle displays a zero-credit charge before each batch.

For each frame:

1. generate six 16:9 still variants in Unlimited mode;
2. reject any frame that breaks gameplay hierarchy or the prohibited list;
3. select at most two candidates;
4. make two to four prompt-specific Unlimited refinements;
5. record candidate paths and rejection reasons in the manifest;
6. ask for art-direction approval across all three frames together.

No credit-funded final is currently justified. A future paid pass requires a
documented deficiency such as 4K delivery, identity consistency, or a fixed
motion-control requirement that the reviewed Unlimited result cannot satisfy.

## Native fallback contract

Opening, Fracture, Final Orbit, and victory cinematics are optional overlays.
Failure, blocking, or absence must reveal the live native state immediately.
No asset controls timers, movement, rewards, voting, qualification, or match
completion.
