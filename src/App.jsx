import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import profiles, { BRIDE_NAME, PET_NAME, BRIDE_PHOTO } from './profiles';
import './App.css';

// ── Sound Effects (Web Audio API — single shared context) ──
let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

const sounds = {
  clink: {
    play: () => {
      try {
        const ctx = getAudioCtx();
        const t = ctx.currentTime;
        // Two overlapping high-freq tones = glass clink
        [2800, 3400].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.1, t + i * 0.03);
          gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.03 + 0.3);
          osc.connect(gain).connect(ctx.destination);
          osc.start(t + i * 0.03);
          osc.stop(t + i * 0.03 + 0.3);
        });
        // Short noise burst for "tink"
        const bufferSize = ctx.sampleRate * 0.05;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.04;
        const noise = ctx.createBufferSource();
        const noiseGain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 4000;
        noise.buffer = buffer;
        noiseGain.gain.setValueAtTime(0.08, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        noise.connect(filter).connect(noiseGain).connect(ctx.destination);
        noise.start(t);
      } catch (e) {}
    }
  },
  revealLike: {
    play: () => {
      try {
        const ctx = getAudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 800;
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.connect(gain).connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + 0.4);
      } catch (e) {}
    }
  },
  revealPass: {
    play: () => {
      try {
        const ctx = getAudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = 250;
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.connect(gain).connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + 0.4);
      } catch (e) {}
    }
  },
  bracketSelect: {
    play: () => {
      try {
        const ctx = getAudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 700;
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
        osc.connect(gain).connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + 0.25);
      } catch (e) {}
    }
  },
  victory: {
    play: () => {
      try {
        const ctx = getAudioCtx();
        [523, 659, 784, 1047].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.15);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.15 + 0.4);
          osc.connect(gain).connect(ctx.destination);
          osc.start(ctx.currentTime + i * 0.15);
          osc.stop(ctx.currentTime + i * 0.15 + 0.4);
        });
      } catch (e) {}
    }
  },
  yay: {
    play: () => {
      try {
        const ctx = getAudioCtx();
        const t = ctx.currentTime;
        // Bubbly ascending yay — fast happy arpeggio
        [523, 659, 784, 1047, 1319, 1568].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0, t + i * 0.07);
          gain.gain.linearRampToValueAtTime(0.18, t + i * 0.07 + 0.04);
          gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.35);
          osc.connect(gain).connect(ctx.destination);
          osc.start(t + i * 0.07);
          osc.stop(t + i * 0.07 + 0.35);
        });
      } catch (e) {}
    }
  }
};

// ── Background Music ──
let _bgAudio = null;
function playBgLoop() {
  try {
    if (_bgAudio) return;
    _bgAudio = new Audio('/photos/Sky-Drifter_AdobeStock_1874446543.wav');
    _bgAudio.loop = true;
    _bgAudio.volume = 0.35;
    _bgAudio.play();
  } catch (e) {}
}
function stopBgMusic() {
  if (_bgAudio) { _bgAudio.pause(); _bgAudio = null; }
}

// ── Phases ──
const PHASE = {
  TITLE: 'title',
  SWIPING: 'swiping',
  INTERMISSION: 'intermission',
  REVEAL: 'reveal',
  BRACKET_INTRO: 'bracket_intro',
  BRACKET: 'bracket',
  FINAL_MATCHUP: 'final_matchup',
  VICTORY: 'victory',
};

// ── Confetti ──
function Confetti() {
  const pieces = Array.from({ length: 80 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 2.5,
    duration: 2.5 + Math.random() * 2,
    color: ['#C9A84C', '#DBCA7E', '#9BAF88', '#FAF6EE', '#6B7F5A', '#A88B2E', '#B5C9A1', '#F3EDE0'][i % 8],
    rotation: Math.random() * 360,
    size: 6 + Math.random() * 10,
  }));

  return (
    <div className="confetti-container">
      {pieces.map(p => (
        <motion.div
          key={p.id}
          className="confetti"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.6,
            background: p.color,
            borderRadius: p.id % 3 === 0 ? '50%' : 2,
          }}
          initial={{ y: -20, rotate: 0, opacity: 1 }}
          animate={{ y: window.innerHeight + 20, rotate: p.rotation + 720, opacity: [1, 1, 1, 0] }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'linear' }}
        />
      ))}
    </div>
  );
}

// ── Floating Olives Background ──
function FloatingOlives() {
  const olives = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    top: Math.random() * 100,
    size: 1.5 + Math.random() * 2,
    delay: Math.random() * 4,
  }));
  return (
    <div className="floating-bg">
      {olives.map(o => (
        <motion.div
          key={o.id}
          className="floating-olive"
          style={{ left: `${o.left}%`, top: `${o.top}%`, fontSize: `${o.size}rem` }}
          animate={{ y: [0, -15, 0], opacity: [0.25, 0.5, 0.25] }}
          transition={{ duration: 4, delay: o.delay, repeat: Infinity, ease: 'easeInOut' }}
        >
          🫒
        </motion.div>
      ))}
    </div>
  );
}

// ── Profile Photo ──
function ProfilePhoto({ photo, name, className = '' }) {
  const [error, setError] = useState(false);
  if (error || !photo) {
    return (
      <div className={`profile-photo-placeholder ${className}`}>
        {name?.[0] || '?'}
      </div>
    );
  }
  return (
    <img src={photo} alt={name} className={className} onError={() => setError(true)} />
  );
}

// ── Olive SVG Decorations ──
function OliveDecor({ className = '' }) {
  return (
    <div className={`olive-decor ${className}`}>
      <span role="img" aria-label="olives">🫒</span>
      <span role="img" aria-label="olives" style={{ marginLeft: '-0.3em', marginTop: '0.2em' }}>🫒</span>
    </div>
  );
}

function MartiniDecor({ className = '' }) {
  return (
    <div className={`martini-decor ${className}`}>
      <span role="img" aria-label="martini">🍸</span>
    </div>
  );
}

// ── Main App ──
function App() {
  const [phase, setPhase] = useState(PHASE.TITLE);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [choices, setChoices] = useState({});
  const [swipeAnim, setSwipeAnim] = useState(null);
  const [revealIndex, setRevealIndex] = useState(0);
  const [revealShown, setRevealShown] = useState(false);

  // Bracket state
  const [bracketRound, setBracketRound] = useState([]);
  const [bracketMatchIndex, setBracketMatchIndex] = useState(0);
  const [bracketWinners, setBracketWinners] = useState([]);
  const [bracketRoundNum, setBracketRoundNum] = useState(1);
  const [finalWinner, setFinalWinner] = useState(null);
  const [eliminated, setEliminated] = useState([]);
  const [showBonusPhotos, setShowBonusPhotos] = useState(false);
  const [showBonusAfter, setShowBonusAfter] = useState(false);
  const [zoomedPhoto, setZoomedPhoto] = useState(null);
  const [showAfterPhoto, setShowAfterPhoto] = useState(false);

  const isAnimating = useRef(false);

  // Start background music once on mount (after first user gesture)
  useEffect(() => {
    const startMusic = () => {
      playBgLoop();
      window.removeEventListener('click', startMusic);
      window.removeEventListener('keydown', startMusic);
    };
    window.addEventListener('click', startMusic, { once: true });
    window.addEventListener('keydown', startMusic, { once: true });
    return () => {
      stopBgMusic();
      window.removeEventListener('click', startMusic);
      window.removeEventListener('keydown', startMusic);
    };
  }, []);

  // Debug: expose controls for testing
  useEffect(() => {
    window.__game = {
      setPhase,
      setChoices,
      setCurrentIndex,
      setRevealIndex,
      setRevealShown,
      setFinalWinner,
      getState: () => ({ phase, currentIndex, choices, revealIndex, revealShown }),
      skipToReveal: () => {
        const c = {};
        profiles.forEach((p, i) => { c[p.id] = i % 2 === 0 ? 'right' : 'left'; });
        setChoices(c);
        setPhase(PHASE.REVEAL);
        setRevealIndex(0);
        setRevealShown(false);
      },
      skipToIntermission: () => {
        const c = {};
        profiles.forEach((p, i) => { c[p.id] = i % 2 === 0 ? 'right' : 'left'; });
        setChoices(c);
        setPhase(PHASE.INTERMISSION);
      },
      skipToBracket: () => {
        const c = {};
        profiles.forEach((p, i) => { c[p.id] = i % 3 !== 0 ? 'right' : 'left'; });
        setChoices(c);
        setPhase(PHASE.BRACKET_INTRO);
      },
    };
  });

  // ── Keyboard Controls ──
  useEffect(() => {
    const handler = (e) => {
      if (isAnimating.current) return;

      if (phase === PHASE.SWIPING) {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
          handleSwipe('left');
        } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
          handleSwipe('right');
        }
      } else if (phase === PHASE.REVEAL) {
        if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
          e.preventDefault();
          handleRevealNext();
        }
      } else if (phase === PHASE.INTERMISSION || phase === PHASE.BRACKET_INTRO) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          if (phase === PHASE.INTERMISSION) setPhase(PHASE.REVEAL);
          else startBracket();
        }
      } else if (phase === PHASE.BRACKET) {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
          handleBracketPick(bracketRound[bracketMatchIndex * 2]);
        } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
          handleBracketPick(bracketRound[bracketMatchIndex * 2 + 1]);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  // ── Swipe Logic ──
  const handleSwipe = useCallback((direction) => {
    if (isAnimating.current || currentIndex >= profiles.length) return;
    isAnimating.current = true;

    const profile = profiles[currentIndex];
    setSwipeAnim(direction);
    setChoices(prev => ({ ...prev, [profile.id]: direction }));

    sounds.clink.play();

    setTimeout(() => {
      setSwipeAnim(null);
      isAnimating.current = false;
      if (currentIndex >= profiles.length - 1) {
        setPhase(PHASE.INTERMISSION);
      } else {
        setCurrentIndex(prev => prev + 1);
      }
    }, 500);
  }, [currentIndex]);

  // ── Reveal Logic ──
  const handleRevealNext = useCallback(() => {
    if (isAnimating.current) return;

    if (!revealShown) {
      isAnimating.current = true;
      setRevealShown(true);
      const profile = profiles[revealIndex];
      const choice = choices[profile.id];
      if (choice === 'right') sounds.revealLike.play();
      else sounds.revealPass.play();
      setTimeout(() => { isAnimating.current = false; }, 300);
    } else {
      if (revealIndex >= profiles.length - 1) {
        const liked = profiles.filter(p => choices[p.id] === 'right');
        if (liked.length === 0) {
          setFinalWinner(profiles[0]);
          setPhase(PHASE.VICTORY);
        } else if (liked.length === 1) {
          setFinalWinner(liked[0]);
          setPhase(PHASE.FINAL_MATCHUP);
        } else {
          setPhase(PHASE.BRACKET_INTRO);
        }
      } else {
        setRevealIndex(prev => prev + 1);
        setRevealShown(false);
      }
    }
  }, [revealIndex, revealShown, choices]);

  // ── Bracket Logic ──
  const startBracket = useCallback(() => {
    const liked = profiles.filter(p => choices[p.id] === 'right');
    setBracketRound([...liked]);
    setBracketMatchIndex(0);
    setBracketWinners([]);
    setBracketRoundNum(1);
    setEliminated([]);
    setPhase(PHASE.BRACKET);
  }, [choices]);

  const handleBracketPick = useCallback((winner) => {
    if (isAnimating.current || !winner) return;
    isAnimating.current = true;
    sounds.bracketSelect.play();

    const loserIdx = bracketMatchIndex * 2;
    const loser = bracketRound[loserIdx] === winner
      ? bracketRound[loserIdx + 1]
      : bracketRound[loserIdx];
    if (loser) setEliminated(prev => [...prev, loser.id]);

    const newWinners = [...bracketWinners, winner];

    setTimeout(() => {
      isAnimating.current = false;
      const nextMatchIndex = bracketMatchIndex + 1;
      const totalMatches = Math.floor(bracketRound.length / 2);

      if (nextMatchIndex < totalMatches) {
        setBracketMatchIndex(nextMatchIndex);
        setBracketWinners(newWinners);
      } else {
        let roundWinners = [...newWinners];
        if (bracketRound.length % 2 === 1) {
          roundWinners.push(bracketRound[bracketRound.length - 1]);
        }

        if (roundWinners.length === 1) {
          setFinalWinner(roundWinners[0]);
          setPhase(PHASE.FINAL_MATCHUP);
        } else {
          setBracketRound(roundWinners);
          setBracketMatchIndex(0);
          setBracketWinners([]);
          setBracketRoundNum(prev => prev + 1);
        }
      }
    }, 600);
  }, [bracketMatchIndex, bracketRound, bracketWinners]);

  // Before → After photo transition during swiping
  useEffect(() => {
    if (phase !== PHASE.SWIPING) return;
    setShowAfterPhoto(false);
    const t = setTimeout(() => setShowAfterPhoto(true), 1500);
    return () => clearTimeout(t);
  }, [currentIndex, phase]);

  // Auto-transition from FINAL_MATCHUP to VICTORY after 2 seconds
  useEffect(() => {
    if (phase === PHASE.FINAL_MATCHUP) {
      const t = setTimeout(() => {
        setPhase(PHASE.VICTORY);
        sounds.victory.play();
        setTimeout(() => sounds.yay.play(), 700);
      }, 2000);
      return () => clearTimeout(t);
    }
  }, [phase]);

  const getRoundName = () => {
    const remaining = bracketRound.length;
    if (remaining <= 2) return 'The Final';
    if (remaining <= 4) return 'Semi-Finals';
    if (remaining <= 8) return 'Quarter-Finals';
    return `Round ${bracketRoundNum}`;
  };

  // ══════════════════════════════
  //  RENDER
  // ══════════════════════════════

  return (
    <div className="app">
      <FloatingOlives />
      <AnimatePresence mode="wait">

        {/* ── TITLE SCREEN ── */}
        {phase === PHASE.TITLE && (
          <motion.div
            key="title"
            className="title-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="title-icon">🍸</div>
            <h1>
              Rach's Final<br />Tini Swipes
            </h1>
            <div className="title-grid">
              {profiles.map((p) => (
                <div key={p.id} className="title-grid-card" onClick={() => setZoomedPhoto(p.photo)}>
                  <img src={p.photo} alt="" className="title-grid-photo" />
                </div>
              ))}
            </div>
            <button className="start-btn" onClick={() => setPhase(PHASE.SWIPING)}>
              Start Swiping
            </button>

            {/* Zoomed photo overlay */}
            <AnimatePresence>
              {zoomedPhoto && (
                <motion.div
                  className="zoom-overlay"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => setZoomedPhoto(null)}
                >
                  <motion.img
                    src={zoomedPhoto}
                    className="zoom-photo"
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.5, opacity: 0 }}
                    transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                    onClick={(e) => e.stopPropagation()}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* ── SWIPING (ACT 1) ── */}
        {phase === PHASE.SWIPING && (
          <motion.div
            key="swiping"
            className="swipe-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="swipe-progress">
              {profiles.map((p, i) => (
                <div
                  key={p.id}
                  className={`swipe-progress-dot ${
                    i < currentIndex ? 'done' : i === currentIndex ? 'active' : ''
                  }`}
                />
              ))}
            </div>

            <div className="swipe-card-perspective">
            <AnimatePresence mode="wait">
              <motion.div
                key={profiles[currentIndex]?.id}
                className="swipe-card-horizontal"
                initial={{ rotateY: 90, opacity: 0 }}
                animate={{ rotateY: 0, opacity: 1 }}
                exit={{ rotateY: -90, opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
              >
                <div className="swipe-card-photo">
                  {/* Before photo — always underneath */}
                  <ProfilePhoto
                    photo={profiles[currentIndex]?.photoBefore || profiles[currentIndex]?.photo}
                    name={profiles[currentIndex]?.name}
                    className="before-photo"
                  />
                  {/* After photo — fades in on top after 1.5s */}
                  <div className={`after-photo-overlay ${showAfterPhoto ? 'visible' : ''}`}>
                    <ProfilePhoto
                      photo={profiles[currentIndex]?.photo}
                      name={profiles[currentIndex]?.name}
                    />
                  </div>
                </div>
                <div className="swipe-card-info">
                  <div className="swipe-card-name">{profiles[currentIndex]?.name}</div>
                  <div className="swipe-card-details">
                    {profiles[currentIndex]?.age} · {profiles[currentIndex]?.height} · {profiles[currentIndex]?.occupation}
                  </div>
                  <div className="swipe-card-pickup-big">"{profiles[currentIndex]?.pickupLine}"</div>
                </div>
                <OliveDecor className="swipe-olive-decor" />
              </motion.div>
            </AnimatePresence>
            </div>

            <div className="swipe-buttons">
              <button className="swipe-btn reject" onClick={() => handleSwipe('left')}>✕</button>
              <button className="swipe-btn accept" onClick={() => handleSwipe('right')}>🍸</button>
            </div>

            <div className="swipe-hint">← A / D → or tap buttons</div>
          </motion.div>
        )}

        {/* ── INTERMISSION ── */}
        {phase === PHASE.INTERMISSION && (
          <motion.div
            key="intermission"
            className="intermission-screen"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <h2 className="intermission-next">Next...</h2>
            <h1>
              Everyone has to<br />
              vote who will<br />
              Rach pick!
            </h1>
            <button className="start-btn" onClick={() => setPhase(PHASE.REVEAL)}>
              Continue to the Reveal
            </button>
          </motion.div>
        )}

        {/* ── REVEAL (ACT 2) ── */}
        {phase === PHASE.REVEAL && (
          <motion.div
            key="reveal"
            className="reveal-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="reveal-header">
              The Reveal — {revealIndex + 1} of {profiles.length}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={`reveal-${revealIndex}`}
                className="reveal-card-simple"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
              >
                <div className="reveal-card-simple-photo">
                  <ProfilePhoto
                    photo={profiles[revealIndex]?.photo}
                    name={profiles[revealIndex]?.name}
                  />
                </div>
                <div className="reveal-card-simple-name">{profiles[revealIndex]?.name}</div>

                {/* Verdict overlay */}
                {revealShown && (
                  <div className={`reveal-verdict-overlay verdict-pop ${choices[profiles[revealIndex]?.id] === 'right' ? 'liked' : 'passed'}`}>
                    {choices[profiles[revealIndex]?.id] === 'right' ? (
                      <div className="verdict-circle yes">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                    ) : (
                      <div className="verdict-circle no">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            <button className="reveal-next-btn" onClick={handleRevealNext}>
              {!revealShown
                ? 'Reveal Choice'
                : revealIndex >= profiles.length - 1
                ? 'Start the Bracket'
                : 'Next Profile'
              }
            </button>
          </motion.div>
        )}

        {/* ── BRACKET INTRO ── */}
        {phase === PHASE.BRACKET_INTRO && (
          <motion.div
            key="bracket-intro"
            className="intermission-screen"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 0.6 }}
          >
            <div className="title-icon">🏆</div>
            <h1>Who's going to be {PET_NAME}'s new dad?</h1>
            <button className="start-btn" onClick={startBracket}>
              Let's Go!
            </button>
          </motion.div>
        )}

        {/* ── BRACKET (ACT 3) ── */}
        {phase === PHASE.BRACKET && bracketRound.length > 0 && (
          <motion.div
            key="bracket"
            className="bracket-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="bracket-header">
              <h2>Who's going to be {PET_NAME}'s dad?</h2>
              <div className="bracket-round">{getRoundName()}</div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={`match-${bracketRoundNum}-${bracketMatchIndex}`}
                className="bracket-matchup"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
              >
                {bracketRound[bracketMatchIndex * 2] && (
                  <motion.div
                    className="bracket-card"
                    onClick={() => handleBracketPick(bracketRound[bracketMatchIndex * 2])}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="profile-photo-container">
                      <ProfilePhoto
                        photo={bracketRound[bracketMatchIndex * 2]?.photo}
                        name={bracketRound[bracketMatchIndex * 2]?.name}
                      />
                    </div>
                    <div className="profile-info">
                      <div className="profile-name-row">
                        <span className="profile-name">{bracketRound[bracketMatchIndex * 2]?.name}</span>
                        <span className="profile-age">{bracketRound[bracketMatchIndex * 2]?.age}</span>
                      </div>
                      <p className="profile-bio">{bracketRound[bracketMatchIndex * 2]?.bio}</p>
                    </div>
                  </motion.div>
                )}

                <div className="bracket-vs">VS</div>

                {bracketRound[bracketMatchIndex * 2 + 1] && (
                  <motion.div
                    className="bracket-card"
                    onClick={() => handleBracketPick(bracketRound[bracketMatchIndex * 2 + 1])}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="profile-photo-container">
                      <ProfilePhoto
                        photo={bracketRound[bracketMatchIndex * 2 + 1]?.photo}
                        name={bracketRound[bracketMatchIndex * 2 + 1]?.name}
                      />
                    </div>
                    <div className="profile-info">
                      <div className="profile-name-row">
                        <span className="profile-name">{bracketRound[bracketMatchIndex * 2 + 1]?.name}</span>
                        <span className="profile-age">{bracketRound[bracketMatchIndex * 2 + 1]?.age}</span>
                      </div>
                      <p className="profile-bio">{bracketRound[bracketMatchIndex * 2 + 1]?.bio}</p>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            </AnimatePresence>

            <div className="bracket-viz">
              {bracketRound.map((p, i) => (
                <div
                  key={p.id}
                  className={`bracket-viz-slot ${
                    i === bracketMatchIndex * 2 || i === bracketMatchIndex * 2 + 1
                      ? 'active'
                      : eliminated.includes(p.id)
                      ? 'eliminated'
                      : ''
                  }`}
                >
                  <ProfilePhoto photo={p.photo} name={p.name} />
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── FINAL MATCHUP ── */}
        {phase === PHASE.FINAL_MATCHUP && finalWinner && (
          <motion.div
            key="final-matchup"
            className="bracket-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="bracket-header">
              <h2>It's a Match!</h2>
            </div>

            <div className="final-matchup">
              <motion.div
                className="final-card"
                initial={{ x: -100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.6, type: 'spring' }}
              >
                <div className="profile-photo-container">
                  <ProfilePhoto photo={BRIDE_PHOTO} name={BRIDE_NAME} />
                </div>
                <div className="profile-info">
                  <span className="profile-name">{BRIDE_NAME}</span>
                </div>
              </motion.div>

              <motion.div
                className="final-heart"
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.3, 1] }}
                transition={{ delay: 0.8, duration: 0.5 }}
              >
                🍸
              </motion.div>

              <motion.div
                className="final-card"
                initial={{ x: 100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.6, type: 'spring' }}
              >
                <div className="profile-photo-container">
                  <ProfilePhoto photo={finalWinner.photo} name={finalWinner.name} />
                </div>
                <div className="profile-info">
                  <span className="profile-name">{finalWinner.name}</span>
                </div>
              </motion.div>
            </div>

          </motion.div>
        )}

        {/* ── VICTORY ── */}
        {phase === PHASE.VICTORY && finalWinner && (
          <motion.div
            key="victory"
            className="victory-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
          >
            <Confetti />
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
            >
              <div className="victory-heart">
                <div className="heart-clip">
                  <ProfilePhoto photo={finalWinner.photo} name={finalWinner.name} />
                </div>
              </div>
            </motion.div>
            <motion.h1
              className="victory-title"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
            >
              Move over Cody, {finalWinner.name} has {BRIDE_NAME}'s heart!
            </motion.h1>
            <motion.div
              className="victory-dog"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.2, type: 'spring', stiffness: 200 }}
              onClick={() => { setShowBonusPhotos(true); setShowBonusAfter(false); setTimeout(() => setShowBonusAfter(true), 1500); }}
              style={{ cursor: 'pointer' }}
            >
              <img src="/photos/Juni.PNG" alt={PET_NAME} />
            </motion.div>
            <AnimatePresence>
              {showBonusPhotos && (
                <motion.div
                  className="bonus-overlay"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  onClick={() => setShowBonusPhotos(false)}
                >
                  <motion.div
                    className="bonus-photos"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="bonus-photo-card">
                      <img src="/photos/Rachel.jpg" alt="Rachel" className="bonus-before" />
                      <div className={`bonus-after-overlay ${showBonusAfter ? 'visible' : ''}`}>
                        <img src="/photos/Rachel boy.JPG" alt="Rachel Boy" />
                      </div>
                    </div>
                    <div className="bonus-photo-card">
                      <img src="/photos/Cody-before.jpg" alt="Cody" className="bonus-before" />
                      <div className={`bonus-after-overlay ${showBonusAfter ? 'visible' : ''}`}>
                        <img src="/photos/Cody girl.jpg" alt="Cody Girl" />
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}

export default App;
