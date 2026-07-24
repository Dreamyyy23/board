# Obscur — The Sixfold Road rules

Obscur is a server-authoritative social race for one to six travelers. One
traveler may escape, but all travelers can lose to the House.

The short version is:

> One traveler may escape. No traveler survives alone. The House wins when the
> table forgets that.

## What you need to win

A traveler becomes **QUALIFIED** after all three of these are true:

- Complete at least one circuit of the 36-space road.
- Carry at least one Alabaster Key.
- Hold at least 13 Echoes.

Qualification does not end the match immediately. The current round finishes,
then every occupied mask receives exactly one turn in the **FINAL ORBIT**.
Travelers may still qualify during that orbit.

After the Final Orbit, the winner is the qualified traveler with, in order:

1. The most Echoes.
2. A completed Vow.
3. The most Golden Threads.
4. The most Resolve.
5. The earliest qualification sequence.

The House wins instead if either:

- the third Fracture occurs; or
- nobody qualifies by the end of the mandatory final round after round 12.

The endgame order and tiebreakers are public from the start.

## Seats, masks, and spectators

The table has six seats, one for each mask: Ember, Veil, Thorn, Moon, Moss, and
Ash. A mask is a seat, not an account.

- A room can have at most six occupied traveler seats.
- Additional visitors join as spectators.
- A disconnected traveler keeps their seat and can return with their private
  reconnect token.
- One person may intentionally occupy all six masks through six independent
  sessions.
- The game does not enforce one seat per person, account, device, IP address,
  or network.

Spectators can follow the same canonical room state and may make audience
predictions. They never roll the die, spend player resources, or decide a
winner.

## The road

The road contains 36 spaces and moves counterclockwise. Before every ordinary
cast, the table shows the six destinations reachable by natural die results
1–6. It reveals each destination's broad class while keeping the exact event
hidden:

- **LIGHT** — Hearth, Echo, Archive, Relic, or Alabaster Key.
- **THRESHOLD** — Oracle or Council.
- **TEETH** — Rift or Snare.

An exact event can be revealed by Moon, MOTH, or an appropriate relic. The
authority still owns the event and final result.

## A normal turn

The recognizable authority clock remains 20 seconds. Short decision and
reaction windows are server-owned parts of the turn; the interface always shows
which decision is open and its authoritative deadline.

### 1. Read the Road

The table shows:

- all six reachable destination classes;
- the current Omen;
- the active traveler's remaining qualification needs;
- Focus, relics, mask charge, Vow progress, and social links;
- any active Fracture modifier.

### 2. Choose an Intent

The active traveler publicly locks one Intent before casting.

#### CLAIM

- LIGHT: gain 1 additional Echo after normal resolution.
- THRESHOLD: gain 1 Focus after the Oracle or Council fully resolves.
- TEETH: add 1 Static after resolution.

CLAIM offers the highest personal upside and the clearest added risk.

#### SHELTER

- Reduce the first negative Echo or Resolve delta by 1.
- Reduce the first backward movement delta by up to 2 spaces.
- If the landing has no negative effect, reduce that event's Echo reward by 1,
  to a minimum of zero.

SHELTER softens harm but does not erase every consequence.

#### BIND

BIND names another occupied traveler before the cast.

- LIGHT: the bound traveler gains 1 Echo and the active traveler gains 1 Golden
  Thread.
- THRESHOLD: both travelers gain 1 Focus after the Oracle or Council fully
  resolves.
- TEETH: the bound traveler receives the first opportunity to Give Oxygen.

BIND never transfers a Key, circuit, relic, or direct qualification. The link
is visible on the table.

If the active traveler does not choose in time, the authority selects SHELTER
and continues the cast.

### 3. Witness predictions

Every occupied non-active traveler may privately predict LIGHT, THRESHOLD, or
TEETH. Predictions reveal with the natural die.

- A correct prediction grants 1 Focus.
- A traveler can receive this reward at most once per round.
- A wrong prediction has no resource penalty.
- Predicting is optional and takes one action.

Spectators can make the same prediction for an accuracy record and the audience
pulse. Spectator predictions do not directly change player resources or
outcomes.

### 4. Cast and Bend

The authority generates and reveals the natural d6 result. The active traveler
then receives a short Bend decision:

- accept the natural result;
- spend 1 Focus to change movement by −1; or
- spend 1 Focus to change movement by +1.

Normal movement remains between 1 and 6. The interface shows the natural die,
modified die, destination change, cost, and remaining time. If no decision
arrives, the authority accepts the natural result.

A mask power or Omen may replace or waive the normal Bend. The server validates
that only one legal movement modifier resolves.

### 5. Resolve and react

The token moves and the authority reveals the event. If the event would remove
Echoes or Resolve, or move the active traveler backward, eligible non-active
travelers receive a short reaction window.

#### Give Oxygen

The first valid helper may:

- spend 1 Resolve, or 1 Echo if they have no Resolve;
- prevent up to 2 total points of Echo/Resolve loss, or up to 2 spaces of
  backward movement;
- gain 1 Golden Thread;
- increase their visible relationship link with the rescued traveler.

Each traveler may Give Oxygen at most once per round. Only one helper resolves a
harmful event, and nobody can rescue themselves this way. Competing reactions
resolve by the first valid command accepted by the authority. Late, repeated,
or already-resolved reactions do not apply again.

A pair can normally create at most one new Golden Thread per round. THREAD and
mask powers can explicitly alter that rule.

### 6. Transmission and Omen

Every landing receives one authority-selected video from the room's bound
YouTube channel. The table, not the client, chooses what arrives.

The selected video ID deterministically creates an Omen for the next ordinary
turn:

- **FLAME** — add 1 to the next positive Echo gain.
- **MIRROR** — reduce the next negative Echo or Resolve delta by 1.
- **DOOR** — the next active traveler may Bend once by ±1 without spending
  Focus.
- **MOTH** — reveal the exact event under the natural destination before the
  Bend decision.
- **THREAD** — the next successful Give Oxygen costs the helper nothing and
  grants both travelers 1 Golden Thread.
- **STATIC** — add 1 to the next event's positive resource reward and add 1 to
  its Static delta.

An Omen applies once and is then consumed. If an embed fails and the authority
assigns a replacement, the final accepted transmission identity determines the
Omen.

Playback never gates the turn. Pausing, muting, skipping, completing, clicking,
or watching a video does not change rewards, odds, resources, qualification, or
victory.

## Static and Fractures

Static is the shared danger clock. Ordinary casts do not add Static merely
because time passed. Static changes through authored events, risky CLAIM
results, powers, Omens, and Council decisions.

- 0–3: **WHISPERING**
- 4–7: **LISTENING**
- 8–11: **HUNGRY**
- 12: **FRACTURE**

At 12 Static:

1. The Fracture count increases.
2. Every player and spectator sees the Fracture sequence.
3. The authority selects one visible, one-round modifier.
4. Static resets to the ruleset's tested recovery value.
5. The House wins immediately if this was the third Fracture.

A Fracture no longer removes two Echoes from every unwarded traveler. Initial
Fracture modifiers include:

- **THE ROAD OPENS** — movement gains 1 this round; event Static gains also
  increase by 1.
- **THE LIGHTS REMEMBER** — the two lowest-Echo travelers gain 1 Echo; SHELTER
  reductions are weakened by 1 this round.
- **THE SIXTH WALL** — correct Witness predictions gain an additional benefit;
  failed active CLAIM outcomes add 2 Static rather than 1.

The active modifier remains visible for its full duration.

## Resources and states

### Echoes

Echoes are the primary qualification resource. They cannot fall below zero.

### Alabaster Keys

Keys come from authored Key events. They cannot be transferred through BIND or
mask powers. At least one is required to qualify.

### Circuits

Crossing the Hearth in the forward direction completes a circuit. At least one
circuit is required to qualify.

### Focus

Focus pays for informed Bends and some authored effects. Focus is normally
capped at 3.

### Resolve and EXPOSED

Resolve pays for rescue and absorbs psychological harm. It does not eliminate a
traveler.

At zero Resolve, a traveler becomes **EXPOSED**:

- their next negative Echo loss increases by 1;
- they cannot pay Give Oxygen with Resolve;
- restoring Resolve removes EXPOSED.

### Golden Threads

Golden Threads are visible records of aid and connection. They are not spent as
currency. They support Vows, relationship lines, the Chronicle, and an endgame
tiebreaker.

### Relics

The table retains three relics:

- **Quiet Bell** manipulates Static or cancels an eligible temporary table
  effect.
- **Mirror Shard** creates a visible defensive reaction or reflection.
- **Foxfire Lens** reveals exact event information among reachable
  destinations.

A traveler can normally carry two relics. If a full inventory converts an
additional relic into another reward, the conversion is shown before it
resolves.

## Oracle and Council

### Oracle

An Oracle pauses the road for the traveler who landed there. Every option shows
both its benefit and its future cost, restriction, oath, or social consequence.
Only that traveler may answer. State-aware cards can refer to their resources,
relationships, leader position, Static, or current Omen.

### Council

A Council pauses the road for a secret table-wide vote.

- The choices and exact consequences are public.
- The interface shows who has voted, but not how.
- Votes reveal one at a time after every required vote arrives or the deadline
  expires.
- The result creates a visible table-wide effect with a defined duration.
- Bot and timeout votes follow deterministic authority policy.

No Council option is intended to be an always-safe default.

## Masks and active powers

Every mask keeps its passive identity and begins with one active-power charge.
A completed Vow restores one charge. Charges do not normally stack above one.

### Passive identities

- **Ember:** the first Echo space in each circuit grants 1 additional Echo.
- **Veil:** the first Snare in each circuit is ignored and grants 4 Echoes.
- **Thorn:** every Rift moves Thorn 1 additional space and grants 4 Echoes.
- **Moon:** every Archive restores 1 Focus and grants 3 Echoes.
- **Moss:** every Hearth restores 1 Resolve and grants 4 Echoes.
- **Ash:** every landing lowers Shared Static by 1; at HUNGRY or worse it also
  grants 1 Echo.

### Ember — Carry the Flame

After the natural die, move +2 instead of taking a normal Bend and add 2 Static.
If this crosses Hearth, gain 2 Echoes.

### Veil — Cut the Thread

During a harmful resolution, cancel one traveler's negative Echo/Resolve delta
or backward movement. Add 1 Static and gain 1 Echo. Veil may target themselves
or another traveler.

### Thorn — Crooked Road

After the natural die, choose either adjacent destination without spending
Focus. If the selected destination is TEETH, gain 1 Echo after resolution.

### Moon — Hear What Comes Next

Before casting, reveal the exact events under two reachable destinations
selected through the authority, then choose an Intent with that information.

### Moss — Keep the Ember

During another traveler's harmful reaction, Moss may pay the rescue cost,
prevent up to 3 harm, and gain 1 Echo. Moss and the rescued traveler each gain
a Golden Thread.

### Ash — Last Witness

Before casting, copy the previous resolved event that was neither a Key nor a
Council. After the natural destination is revealed, Ash may resolve the current
event or the witnessed event while still landing on the natural destination,
gaining 2 Echoes if the witnessed event is chosen. After the first successful
Last Witness turn that keeps Static from rising, Ash retains the charge so the
two-use Vow remains achievable; the completed Vow then performs the normal
recharge.

Every power has a server-owned timing window. A late or repeated command cannot
resolve the power twice, and no power can transfer a Key or directly declare
victory.

## Vows

Vows reward chosen behavior and complete once per match:

- **Ember — Walk the Bent Road:** willingly enter TEETH through CLAIM or Carry
  the Flame three times.
- **Veil — Remain Uncaught:** reduce or prevent three harmful consequences
  through SHELTER, Oxygen, or Cut the Thread.
- **Thorn — Answer the Two Mouths:** deliberately Bend or Crooked Road into two
  THRESHOLD spaces and complete their decisions.
- **Moon — Hear the Lost Signal:** use revealed event information or MOTH to
  change a decision three times.
- **Moss — Tend the Small Lights:** participate in two rescues and form Golden
  Threads with at least two different travelers.
- **Ash — Keep What Was Left:** use Last Witness successfully twice and finish
  a turn without increasing Static.

Completing a Vow is public. It grants 3 Echoes, 1 Focus, and restores the mask's
active charge.

## Rounds and the guaranteed ending

A round is complete after every traveler who belongs to that round receives one
normal turn. The authority tracks this explicitly so empty seats, bots, and
reconnections cannot corrupt fairness.

- From round 9 onward, the table shows the approaching hard ending.
- If somebody qualifies, finish the current round and then play the Final
  Orbit.
- If nobody has triggered the Final Orbit by the end of round 12, play one
  mandatory final round.
- If nobody qualifies during that round, the House wins.

The third Fracture always ends the match immediately in a House victory.

## Chronicle

Every completed match produces a structured Chronicle containing:

- the winner or House victory;
- the decisive turn;
- every Golden Thread rescue;
- Council results;
- Fractures;
- completed Vows;
- Keys found;
- the final transmission;
- three automatically selected highlight moments.

The Chronicle records structured authority events. It is not reconstructed by
parsing prose.

## Accessibility and fair play

Intent, prediction, Bend, reaction, Oracle, Council, relic, and mask-power
controls are keyboard operable. Critical state uses text and symbols as well as
color. Reduced motion changes presentation, not information or timing.

Donations and the support portal never change seats, rolls, odds, videos,
resources, powers, rewards, the Alabaster Key, the ARG wallet, qualification,
or victory.
