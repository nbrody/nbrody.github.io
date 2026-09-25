/** Decode a Standard MIDI File into timestamped MIDI channel messages. */
export function parseMidiFile(input) {
  let bytes;
  if (input instanceof Uint8Array) bytes = input;
  else if (input instanceof ArrayBuffer) bytes = new Uint8Array(input);
  else throw new TypeError('MIDI input must be an ArrayBuffer or Uint8Array.');

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fail = (message) => { throw new Error(`Invalid MIDI file: ${message}`); };
  const requireBytes = (offset, length, limit = bytes.length) => {
    if (length < 0 || offset > limit - length) fail('truncated chunk or event.');
  };
  const chunkName = (offset) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  const readVariable = (state, limit) => {
    let value = 0;
    for (let count = 0; count < 4; count++) {
      requireBytes(state.offset, 1, limit);
      const byte = bytes[state.offset++];
      value = value * 128 + (byte & 0x7f);
      if (!(byte & 0x80)) return value;
    }
    fail('variable-length value exceeds four bytes.');
  };

  requireBytes(0, 14);
  if (chunkName(0) !== 'MThd') fail('missing MThd header.');
  const headerLength = view.getUint32(4);
  if (headerLength < 6) fail('header is too short.');
  requireBytes(8, headerLength);
  const format = view.getUint16(8);
  const trackCount = view.getUint16(10);
  const division = view.getUint16(12);
  if (format === 2) fail('format 2 uses independent sequences and is not supported.');
  if (format > 1) fail('only formats 0 and 1 are supported.');
  if (!trackCount || (format === 0 && trackCount !== 1)) fail('invalid track count.');
  if (division & 0x8000) fail('SMPTE timing is not supported; use a PPQ MIDI file.');
  if (!division) fail('ticks per quarter note must be positive.');

  const timeline = [];
  let offset = 8 + headerLength;
  let endTick = 0;
  let name;
  for (let track = 0; track < trackCount;) {
    requireBytes(offset, 8);
    const kind = chunkName(offset);
    const length = view.getUint32(offset + 4);
    const start = offset + 8;
    requireBytes(start, length);
    const limit = start + length;
    offset = limit;
    // SMF readers may encounter additional application-specific chunks.
    if (kind !== 'MTrk') continue;
    track++;

    const state = { offset: start };
    let tick = 0;
    let runningStatus = 0;
    let ended = false;
    while (state.offset < limit) {
      tick += readVariable(state, limit);
      if (!Number.isSafeInteger(tick)) fail('track duration is too large.');
      requireBytes(state.offset, 1, limit);
      let status = bytes[state.offset];
      if (status & 0x80) {
        state.offset++;
        runningStatus = status < 0xf0 ? status : 0;
      } else {
        if (!runningStatus) fail('running status has no preceding channel message.');
        status = runningStatus;
      }

      if (status === 0xff) {
        requireBytes(state.offset, 1, limit);
        const type = bytes[state.offset++];
        const metaLength = readVariable(state, limit);
        requireBytes(state.offset, metaLength, limit);
        if (type === 0x51) {
          if (metaLength !== 3) fail('tempo event must contain three bytes.');
          const tempo = bytes[state.offset] * 65536 + bytes[state.offset + 1] * 256 + bytes[state.offset + 2];
          if (!tempo) fail('tempo must be positive.');
          timeline.push({ tick, tempo });
        } else if (type === 0x03 && name === undefined) {
          const decoded = new TextDecoder().decode(bytes.subarray(state.offset, state.offset + metaLength)).trim();
          if (decoded) name = decoded;
        } else if (type === 0x2f) {
          if (metaLength !== 0) fail('end-of-track event must be empty.');
          ended = true;
        }
        state.offset += metaLength;
        if (ended) {
          if (state.offset !== limit) fail('data appears after end-of-track.');
          break;
        }
      } else if (status === 0xf0 || status === 0xf7) {
        const sysexLength = readVariable(state, limit);
        requireBytes(state.offset, sysexLength, limit);
        state.offset += sysexLength;
      } else if (status >= 0x80 && status < 0xf0) {
        const messageLength = (status & 0xe0) === 0xc0 ? 1 : 2;
        requireBytes(state.offset, messageLength, limit);
        const data = [status];
        for (let index = 0; index < messageLength; index++) {
          const value = bytes[state.offset++];
          if (value & 0x80) fail('channel message contains an invalid data byte.');
          data.push(value);
        }
        timeline.push({ tick, data });
      } else {
        fail(`unsupported status byte 0x${status.toString(16)}.`);
      }
    }
    if (!ended) fail('track is missing its end-of-track event.');
    endTick = Math.max(endTick, tick);
  }

  // Stable sorting preserves event order within each track and gives same-tick
  // tempo changes a deterministic order across a format-1 file's tracks.
  timeline.sort((a, b) => a.tick - b.tick);
  const events = [];
  let tick = 0;
  let seconds = 0;
  let tempo = 500000; // Standard MIDI's default tempo is 120 BPM.
  for (const event of timeline) {
    seconds += (event.tick - tick) * tempo / (division * 1000000);
    tick = event.tick;
    if (event.tempo !== undefined) tempo = event.tempo;
    else events.push({ time: seconds, data: event.data });
  }
  const duration = seconds + (endTick - tick) * tempo / (division * 1000000);
  return { events, duration, ...(name ? { name } : {}) };
}
