let lastClues = new Map();
let clueRound = null;
let clueRoomKey = '';
let clueSnapshotReady = false;
let clueAudioContext = null;

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

function showClueNotice(player, clue) {
  const stack = document.querySelector('#clueNotifications');
  if (!stack) return;
  const notice = document.createElement('article');
  notice.className = 'clue-pop';
  const head = document.createElement('div');
  head.className = 'clue-pop-head';
  const name = document.createElement('span');
  name.className = 'clue-pop-name';
  name.textContent = player.name;
  const label = document.createElement('span');
  label.className = 'clue-pop-label';
  label.textContent = 'NEW CLUE';
  const text = document.createElement('div');
  text.className = 'clue-pop-text';
  text.textContent = `“${clue}”`;
  head.append(name, label);
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
};
