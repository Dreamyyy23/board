# Broadcast mode

Broadcast mode is the spectator-first presentation of Obscur — The Sixfold
Road. It keeps the same canonical room state as the player view and never gains
extra game authority.

## Open the broadcast view

Join or create the room normally, then add the broadcast query to the game URL:

```text
?broadcast=1
```

For stream capture, use a 1920×1080 browser source at 100% page zoom. The layout
is designed for a 16:9 frame and keeps the board, decision, escalation clock,
and transmission visible together.

Broadcast mode does not expose reconnect tokens, private command payloads,
credentials, channel catalogs, deployment information, or other operational
state.

## What the layout prioritizes

A viewer should be able to identify these facts within a few seconds:

- whose turn it is;
- what that traveler still needs to qualify;
- the Intent they chose;
- the six reachable destination classes;
- the natural and final die;
- the current Omen;
- Static state and Fracture count;
- the latest three event summaries;
- the active transmission;
- the Final Orbit or House-loss countdown.

The full board remains the primary surface. Routine landings do not cover it.

## Presentation states

The root game surface can announce and frame these authority-owned states:

- turn opening;
- Intent locked;
- cast;
- Bend decision;
- token travel;
- event reveal;
- Give Oxygen rescue;
- mask power;
- Oracle;
- Council voting;
- Council reveal;
- Fracture;
- Vow completion;
- Key found;
- qualification;
- Final Orbit;
- traveler victory or House victory.

Ordinary events use restrained emphasis. Oracle, Council, Fracture,
qualification, and final events may use a larger takeover because they change
the whole table's immediate story.

## Event captions

Broadcast captions come from structured server events rather than parsing the
Chronicle's prose. A normal resolution can read:

```text
MOON → NATURAL 5 → BENT TO 4 → ARCHIVE → +2 ECHO / +1 FOCUS / STATIC +1
```

A social reaction can read:

```text
MOSS GAVE OXYGEN TO VEIL → PREVENTED 2 ECHO LOSS → GOLDEN THREAD FORMED
```

Captions identify the actor, decision, destination, and consequence. The latest
three remain visible long enough for somebody entering mid-turn to understand
the room.

## Transmission dock

Every landing still stages the authority-selected channel transmission.

- An ordinary landing uses a short ritual stinger, then docks the video without
  covering the board.
- Oracle, Council, Fracture, qualification, and final events may use a larger,
  brief takeover.
- The dock identifies the title, creator/channel, and derived Omen.
- Native playback controls remain available.
- A blocked or rejected embed receives an accessible fallback.
- Gameplay continues without waiting for playback or video completion.

Playback, attention, clicks, watch duration, and autoplay success never create
game rewards.

## Audience pulse

Spectators may predict LIGHT, THRESHOLD, or TEETH before the natural die
reveals. Broadcast mode shows:

- the aggregate prediction before reveal;
- accuracy after reveal;
- the current spectator sample size.

The optional streamer setting can enable **THE HOUSE'S GUESS** once per round
when the minimum spectator sample is met. The majority prediction becomes the
House's Guess. If it is correct, the transmission stinger is upgraded and the
Chronicle records the moment.

The House's Guess does not:

- take resources from a player;
- modify movement or events;
- choose an Oracle or Council answer;
- create a Key or qualification;
- decide the winner.

There is no raw chat-to-game command pipe. Spectator actions are rate-limited
and the host can disable the audience effect.

## Capture safe areas

At 1920×1080, keep platform overlays away from:

- the active mask and player name;
- the authority clock;
- the Intent and six reachable outcomes;
- the Static/Fracture meter;
- the Final Orbit or House-loss countdown;
- the transmission title and Omen;
- the event-caption strip.

If a streaming platform adds chat over the capture, place it over low-priority
ambient background rather than the board, command rail, or transmission
controls.

## Audio

Game cues communicate transitions, not hidden information. A stream mix may
include:

- turn opening;
- Intent lock;
- die reveal;
- rescue;
- mask power;
- Fracture;
- qualification;
- final result.

Transmission audio remains under the embedded player's native controls.
Autoplay may be blocked by the browser, so the visual state must remain complete
without audio.

## Accessibility

Broadcast mode preserves the same information in the reduced-motion path.

- No rapid flashing.
- Color is not the only carrier of mask or destination class.
- Captions remain readable at 1080p.
- Turn, timer threshold, result, and major events are announced through live
  regions in the interactive view.
- Keyboard controls remain available when the broadcast operator is also an
  active player.
- Camera-like emphasis never removes the textual outcome.

Reduced motion changes travel, scale, and transition effects; it does not
change authority timing or omit state.

## Production truth

The checked-in source and the public room authority may run different protocol
generations during a staged rollout. Keep compatibility messaging visible until
the modern authority is deployed and verified. A local broadcast feature is
not publicly live merely because the source build succeeds.

Before calling a broadcast release live, verify:

1. the production authority's reported protocol;
2. a six-seat room plus spectator joins;
3. reconnect during every new decision phase;
4. transmission failover and final Omen identity;
5. no reconnect token or private vote appears in captured state;
6. a complete Final Orbit and a House-victory ending;
7. the 1920×1080 layout with normal and reduced motion.
