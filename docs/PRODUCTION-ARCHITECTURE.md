# Production architecture

The current build is a complete local vertical slice. Its public contract is
designed so the in-memory room authority can be replaced without changing the
game rules or browser UI.

## One authority per room

A room must have exactly one writer. Every command includes a room code and a
private reconnect token. The authority validates the command, mutates state,
then broadcasts a public snapshot. Clients never submit die values, positions,
scores, deadlines, or resolved events.

```text
Create / join
      │
      ▼
Directory chooses one healthy host
      │
      ▼
Room authority ── validates command
      │           mutates canonical state
      └───────── broadcasts public snapshot
```

For production, use either:

1. Cloudflare Durable Objects, with one object instance per room code; or
2. a Socket.IO Node fleet using Redis for room broadcasts and durable room
   snapshots.

The local `Map` implementation must not be placed behind a multi-instance load
balancer because two instances could believe they own the same room.

## Rotating host directory

A trusted community host can register:

- host ID
- HTTPS/WSS endpoint
- protocol version
- region
- maximum concurrent rooms
- current room count
- heartbeat timestamp
- maintenance status

The directory returns a host only after an active health check. Registration
must be allowlisted or signed; otherwise an attacker can advertise a malicious
room authority. Reconnect tokens never pass through the directory.

Host rotation is assignment, not mid-match migration. The selected authority
owns a room until the match ends. Live migration is a later feature requiring a
versioned state snapshot and a short-lived signed handoff token.

## Abuse controls

- Rate-limit create, join, roll, and choice commands by IP and socket.
- Permit one occupied seat per reconnect token.
- Cap a room at six players; extra connections are spectators.
- Expire empty rooms and disconnected reservations.
- Validate names and event IDs server-side.
- Keep the event/video catalogue allowlisted.
- Record aggregate game events in first-party analytics rather than using
  third-party playback as a metric.

Taking all six public seats is currently allowed by the game concept. Private
rooms can later add an invite secret or a keeper approval queue.

## Video event rule

Room creation binds one public YouTube channel. Every landing selects one
catalogued video on the authority and broadcasts the same assignment to the
table. The client may attempt visible autoplay after the player's room/roll
gesture, while preserving native pause, mute, captions, fullscreen, branding,
and controls. A blocked browser receives an adjacent start control.

The player remains at least 200 by 200 pixels, stays predominantly visible,
and is never covered by game art. Only one YouTube player is mounted per client.
Progression resolves independently of playback; pausing, completion, watch
duration, likes, and subscriptions never change rewards or victory.

## Deployment sequence

1. Deploy a durable room authority and obtain its WSS/Socket.IO endpoint.
2. Set `CLIENT_ORIGINS` on that authority to the final web origin.
3. Build the browser client with `NEXT_PUBLIC_GAME_SERVER_URL` pointing at it.
4. Run the two-client integration suite against the production authority.
5. Enable directory-based host selection only after at least two compatible
   authorities pass the same protocol test.
