// Tunes for the beach machine. Like the Glass House machine it is in D major,
// and the random voices (steel pans, lighthouse tines, castle chimes) use the
// D-major pentatonic, so any coincidence of notes stays consonant.

// "What Shall We Do with the Drunken Sailor" (traditional sea shanty), in E
// dorian — the notes of D major — for the boardwalk marimba lanes.
// Lane I plays the first two lines, lane II the last two. [midi, beats]
const D4 = 62, E4 = 64, FS4 = 66, G4 = 67, A4 = 69, B4 = 71, CS5 = 73, D5 = 74, E5 = 76;
const line = (n, a, b, c) => [[n, 1], [n, 0.5], [n, 0.5], [n, 1], [n, 0.5], [n, 0.5], [n, 1], [a, 1], [b, 1], [c, 1]];
export const SHANTY_I = [...line(B4, E4, G4, B4), ...line(A4, D4, FS4, A4)];
export const SHANTY_II = [...line(B4, CS5, D5, E5), [D5, 1], [B4, 1], [A4, 1], [FS4, 1], [E4, 2], [E4, 2]];
