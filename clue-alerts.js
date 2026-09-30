let lastClues = new Map();
let clueRound = null;
let clueRoomKey = '';
let clueSnapshotReady = false;
let clueAudioContext = null;
let outcomeRoomKey = '';
let lastOutcomeRound = '';

function unlockClueAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    if (!clueAudioContext) clueAudioContext = new AudioContextClass();
    if (clueAudioContext.state === 'suspended') clueAudioContext.resume().catch(() => {});
  } catch {}
}

document.addEventListener('pointerdown', unlockClueAudio, { passive: true });
document.addEventListener('keydown', unlockClueAudio);

function playClueChime() {
  if (!clueAudioContext) return;
  clueAudioContext.resume().then(() => {
    const now = clueAudioContext.currentTime;
    [784, 1046].forEach((frequency, index) => {
      const start = now + index * 0.11;
      const oscillator = clueAudioContext.createOscillator();
      const volume = clueAudioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      volume.gain.setValueAtTime(0.0001, start);
      volume.gain.exponentialRampToValueAtTime(0.12, start + 0.018);
      volume.gain.exponentialRampToValueAtTime(0.0001, start + 0.23);
      oscillator.connect(volume);
      volume.connect(clueAudioContext.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.24);
    });
  }).catch(() => {});
}

function playOutcomeSound(winner) {
  if (!clueAudioContext) return;
  const happy = winner === 'group';
  const notes = happy ? [523, 659, 784, 1046] : [494, 392, 330, 262];
  clueAudioContext.resume().then(() => {
    const now = clueAudioContext.currentTime;
    notes.forEach((frequency, index) => {
      const start = now + index * (happy ? 0.12 : 0.2);
      const duration = happy ? 0.2 : 0.3;
      const oscillator = clueAudioContext.createOscillator();
      const volume = clueAudioContext.createGain();
      oscillator.type = happy ? 'sine' : 'triangle';
      oscillator.frequency.setValueAtTime(frequency, start);
      volume.gain.setValueAtTime(0.0001, start);
      volume.gain.exponentialRampToValueAtTime(happy ? 0.13 : 0.11, start + 0.025);
      volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(volume);
      volume.connect(clueAudioContext.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.01);
    });
  }).catch(() => {});
}

function observeRoundOutcome() {
  if (!saved || !state) {
    outcomeRoomKey = '';
    lastOutcomeRound = '';
    return;
  }
  const roomKey = `${saved.code}:${saved.playerId}`;
  if (roomKey !== outcomeRoomKey) {
    outcomeRoomKey = roomKey;
    lastOutcomeRound = '';
  }
  const roundKey = `${roomKey}:${state.round}`;
  if (state.phase === 'reveal' && state.winner && roundKey !== lastOutcomeRound) {
    lastOutcomeRound = roundKey;
    playOutcomeSound(state.winner);
  }
}

function showClueNotice(player, clue) {
  const stack = document.querySelector('#clueNotifications');
  if (!stack) return;
  const notice = document.createElement('article');
  notice.className = 'clue-pop';
  const head = document.createElement('div');
  head.className = 'clue-pop-head';
  const person = document.createElement('div');
  person.className = 'clue-pop-person';
  const avatar = document.createElement('span');
  avatar.className = 'clue-pop-avatar';
  avatar.textContent = player.avatar || '😎';
  const name = document.createElement('span');
  name.className = 'clue-pop-name';
  name.textContent = player.name;
  const label = document.createElement('span');
  label.className = 'clue-pop-label';
  label.textContent = 'NEW CLUE';
  const text = document.createElement('div');
  text.className = 'clue-pop-text';
  text.textContent = `“${clue}”`;
  person.append(avatar, name);
  head.append(person, label);
  notice.append(head, text);
  stack.prepend(notice);
  while (stack.children.length > 3) stack.lastElementChild.remove();
  playClueChime();
  window.setTimeout(() => {
    notice.classList.add('clue-pop-out');
    window.setTimeout(() => notice.remove(), 300);
  }, 5200);
}

function observeClues() {
  if (!saved || !state) {
    lastClues.clear();
    clueRound = null;
    clueRoomKey = '';
    clueSnapshotReady = false;
    return;
  }

  const roomKey = `${saved.code}:${saved.playerId}`;
  if (roomKey !== clueRoomKey || state.round !== clueRound) {
    clueRoomKey = roomKey;
    clueRound = state.round;
    lastClues.clear();
    clueSnapshotReady = false;
  }

  if (!clueSnapshotReady) {
    for (const player of state.players) lastClues.set(player.id, player.clue || '');
    clueSnapshotReady = true;
    return;
  }

  for (const player of state.players) {
    const clue = player.clue || '';
    const previous = lastClues.get(player.id) || '';
    if (player.id !== saved.playerId && clue && clue !== previous && (state.phase === 'clue' || state.phase === 'vote')) {
      showClueNotice(player, clue);
    }
    lastClues.set(player.id, clue);
  }
}

const renderWithClueAlerts = render;
render = function (...args) {
  renderWithClueAlerts(...args);
  observeClues();
  observeRoundOutcome();
};
