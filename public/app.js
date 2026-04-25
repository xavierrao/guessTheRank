const { useState, useEffect, useRef } = React;

// Read game ID from URL path: /game/<id>
function getGameIdFromUrl() {
    const parts = window.location.pathname.split('/');
    if (parts[1] === 'game' && parts[2]) return parts[2];
    return '';
}

// Read ?join=GAMEID query param for pre-filling the join input
function getJoinParamFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('join') || '';
}

// Update the URL without a page reload
function setUrlGameId(gameId) {
    const newPath = gameId ? `/game/${gameId}` : '/';
    if (window.location.pathname !== newPath) {
        window.history.pushState({}, '', newPath);
    }
}

const HomeButton = ({ onClick }) => (
    <button onClick={onClick} title="Go home" className="home-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
        </svg>
        Home
    </button>
);

const App = () => {
    const [socket, setSocket] = useState(null);
    const [gameId, setGameId] = useState(() => getGameIdFromUrl() || getJoinParamFromUrl());
    const [playerName, setPlayerName] = useState(() => localStorage.getItem('gtr_playerName') || '');
    const [isOwner, setIsOwner] = useState(false);
    const [players, setPlayers] = useState([]);
    const [gameState, setGameState] = useState('joining');
    const [myQuestion, setMyQuestion] = useState('');
    const [currentRanker, setCurrentRanker] = useState(null);
    const [currentTarget, setCurrentTarget] = useState(null);
    const [currentQuestion, setCurrentQuestion] = useState('');
    const [currentGuesses, setCurrentGuesses] = useState({});
    const [actualPosition, setActualPosition] = useState(null);
    const [currentFullRanking, setCurrentFullRanking] = useState(null);
    const [ranking, setRanking] = useState([]);
    const [hasSubmittedRanking, setHasSubmittedRanking] = useState(false);
    const [hasSubmittedGuess, setHasSubmittedGuess] = useState(false);
    const [selectedGuess, setSelectedGuess] = useState(null);
    const [points, setPoints] = useState({});
    const [noMoreQuestions, setNoMoreQuestions] = useState(false);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);
    const [showCopyMenu, setShowCopyMenu] = useState(false);
    const [hasAttemptedRejoin, setHasAttemptedRejoin] = useState(false);
    const [isSpectator, setIsSpectator] = useState(false);
    const [spectatorCount, setSpectatorCount] = useState(0);
    const [inGame, setInGame] = useState(false);
    const copyMenuRef = useRef(null);

    useEffect(() => {
        if (!showCopyMenu) return;
        const handleClickOutside = (e) => {
            if (copyMenuRef.current && !copyMenuRef.current.contains(e.target)) {
                setShowCopyMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showCopyMenu]);

    // Ref so socket event handlers always see the latest playerName without recreating the socket
    const playerNameRef = useRef(playerName);
    useEffect(() => { playerNameRef.current = playerName; }, [playerName]);

    // Keep a ref to goHome so the popstate listener can call it without going stale
    const goHomeRef = useRef(null);

    useEffect(() => {
        const handlePopState = () => {
            const urlGameId = getGameIdFromUrl();
            if (!urlGameId) {
                if (goHomeRef.current) goHomeRef.current();
            } else {
                const savedName = localStorage.getItem('gtr_playerName');
                if (savedName && socket) {
                    setInGame(true);
                    socket.emit('rejoinGame', { gameId: urlGameId, playerName: savedName });
                }
            }
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [socket]);

    useEffect(() => {
        const newSocket = io();
        setSocket(newSocket);

        // Auto-rejoin if we have a game ID in the URL and a saved name
        const urlGameId = getGameIdFromUrl();
        const savedName = localStorage.getItem('gtr_playerName');
        if (urlGameId && savedName && !hasAttemptedRejoin) {
            setHasAttemptedRejoin(true);
            newSocket.once('connect', () => {
                newSocket.emit('rejoinGame', { gameId: urlGameId, playerName: savedName });
            });
            if (newSocket.connected) {
                newSocket.emit('rejoinGame', { gameId: urlGameId, playerName: savedName });
            }
        }

        newSocket.on('gameState', ({
            state, players, spectators, gameId: receivedGameId,
            myQuestion, currentRanker, currentTarget, currentQuestion,
            currentGuesses, actualPosition, currentFullRanking,
            points, noMoreQuestions, owner,
            isSpectator: spectatorFlag,
            hasSubmittedRanking: submitted, hasSubmittedGuess: submittedGuess
        }) => {
            setGameState(state);
            setPlayers(players || []);
            setMyQuestion(myQuestion || '');
            setCurrentRanker(currentRanker || null);
            setCurrentTarget(currentTarget || null);
            setCurrentQuestion(currentQuestion || '');
            setCurrentGuesses(currentGuesses || {});
            setActualPosition(actualPosition || null);
            setCurrentFullRanking(currentFullRanking || null);
            setPoints(points || {});
            setNoMoreQuestions(noMoreQuestions || false);
            setIsOwner(playerNameRef.current === owner);
            setSpectatorCount((spectators || []).length);
            if (spectatorFlag) setIsSpectator(true);
            if (state === 'ranking') {
                setIsSpectator(false);
                setHasSubmittedRanking(submitted || false);
                setHasSubmittedGuess(false);
                setSelectedGuess(null);
                setRanking([]);
            }
            if (state === 'guessing') {
                setSelectedGuess(null);
                setHasSubmittedGuess(submittedGuess || false);
            }
            if (submitted !== undefined) setHasSubmittedRanking(submitted);
            if (submittedGuess !== undefined) setHasSubmittedGuess(submittedGuess);
            if (receivedGameId) {
                setGameId(receivedGameId);
                setUrlGameId(receivedGameId);
                setInGame(true);
            }
        });

        newSocket.on('rankingSubmitted', () => {
            setHasSubmittedRanking(true);
        });

        newSocket.on('spectatorJoined', () => {
            setSpectatorCount(c => c + 1);
        });

        newSocket.on('ownerChanged', ({ newOwner }) => {
            setIsOwner(newOwner === playerNameRef.current);
        });

        newSocket.on('error', (message) => {
            setError(message);
            setInGame(false);
            setTimeout(() => setError(''), 5000);
        });

        newSocket.on('connect_error', () => {
            setError('Failed to connect to server');
            setTimeout(() => setError(''), 5000);
        });

        newSocket.on('gameExpired', () => {
            setGameState('joining');
            setInGame(false);
            setGameId('');
            setPlayers([]);
            setPoints({});
            setIsSpectator(false);
            setError('Game ended due to inactivity');
            setTimeout(() => setError(''), 5000);
        });

        return () => newSocket.disconnect();
    }, []);

    const goHome = () => {
        if (socket && gameId) socket.emit('leaveGame', { gameId, playerName });
        setGameState('joining');
        setInGame(false);
        setGameId('');
        setPlayers([]);
        setPoints({});
        setMyQuestion('');
        setCurrentRanker(null);
        setCurrentTarget(null);
        setCurrentQuestion('');
        setCurrentGuesses({});
        setActualPosition(null);
        setCurrentFullRanking(null);
        setRanking([]);
        setHasSubmittedRanking(false);
        setHasSubmittedGuess(false);
        setSelectedGuess(null);
        setIsSpectator(false);
        setSpectatorCount(0);
        setNoMoreQuestions(false);
        setUrlGameId('');
    };
    goHomeRef.current = goHome;

    const createGame = () => {
        if (playerName.trim()) {
            localStorage.setItem('gtr_playerName', playerName.trim());
            setInGame(true);
            socket.emit('createGame', playerName.trim());
        } else { setError('Please enter your name'); setTimeout(() => setError(''), 5000); }
    };

    const joinGame = () => {
        if (playerName.trim() && gameId.trim()) {
            localStorage.setItem('gtr_playerName', playerName.trim());
            setInGame(true);
            socket.emit('joinGame', { gameId: gameId.trim(), playerName: playerName.trim() });
        } else { setError('Please enter your name and game ID'); setTimeout(() => setError(''), 5000); }
    };

    const startGame = () => socket.emit('startGame', gameId);

    const submitRanking = () => {
        if (ranking.length === players.length) {
            socket.emit('submitRanking', { gameId, ranking });
        }
    };

    const submitGuess = () => {
        if (selectedGuess !== null) {
            socket.emit('submitGuess', { gameId, guess: selectedGuess });
            setHasSubmittedGuess(true);
        }
    };

    const nextReveal = () => socket.emit('nextReveal', gameId);

    // Tap-to-build ranking helpers
    const rankedSet = new Set(ranking);
    const unrankedPlayers = players.filter(p => !rankedSet.has(p));

    const tapToRank = (player) => setRanking(prev => [...prev, player]);
    const removeFromRanking = (player) => setRanking(prev => prev.filter(p => p !== player));

    // Reset ranking when entering ranking state
    useEffect(() => {
        if (gameState === 'ranking') setRanking([]);
    }, [gameState]);

    const PlayerList = ({ showPoints = true }) => (
        <div className="player-list">
            {players.map((player) => (
                <div key={player} className={`player-row ${player === playerName ? 'is-me' : ''}`}>
                    {showPoints && <div className="player-score">{points[player] || 0}</div>}
                    <span className={`player-name ${player === playerName ? 'me' : ''}`}>
                        {player}{player === playerName ? ' (you)' : ''}
                    </span>
                </div>
            ))}
        </div>
    );

    const guessedPositions = Object.values(currentGuesses);
    const numGuessers = players.filter(p => p !== currentRanker).length;
    const waitingForGuesses = guessedPositions.length < numGuessers;

    return (
        <div className="app-wrap">
            {inGame && <HomeButton onClick={goHome} />}

            <h1 className="page-title">Guess the Rank</h1>
            <p className="page-subtitle">The Ranking Party Game</p>

            {gameId && inGame && (
                <div className="copy-badge-wrap" ref={copyMenuRef}>
                    <div
                        className="game-id-badge"
                        onClick={() => setShowCopyMenu(m => !m)}
                        title="Share game"
                    >
                        🎮 Game ID: <strong>{gameId}</strong>
                        {copied ? (
                            <span className="copied-label">Copied!</span>
                        ) : (
                            <svg className="copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                        )}
                    </div>
                    {showCopyMenu && (
                        <div className="copy-menu">
                            {[
                                {
                                    label: '🔢 Copy ID',
                                    action: () => {
                                        navigator.clipboard.writeText(gameId);
                                        setCopied(true);
                                        setShowCopyMenu(false);
                                        setTimeout(() => setCopied(false), 2000);
                                    }
                                },
                                {
                                    label: '🔗 Copy Link',
                                    action: () => {
                                        const link = `${window.location.origin}/?join=${gameId}`;
                                        navigator.clipboard.writeText(link);
                                        setCopied(true);
                                        setShowCopyMenu(false);
                                        setTimeout(() => setCopied(false), 2000);
                                    }
                                }
                            ].map(({ label, action }) => (
                                <button key={label} onClick={action} className="copy-menu-btn">{label}</button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {error && <div className="alert alert-error">⚠️ {error}</div>}
            {noMoreQuestions && (
                <div className="alert alert-warning">
                    🃏 No more questions available. Start a new game!
                </div>
            )}
            {isSpectator && gameState !== 'ranking' && (
                <div className="alert alert-warning">
                    👀 You joined mid-round — you're spectating. You'll be added as a player at the start of the next round.
                </div>
            )}
            {!isSpectator && spectatorCount > 0 && inGame && gameState !== 'waiting' && (
                <div className="spectator-bar">
                    👀 {spectatorCount} spectator{spectatorCount !== 1 ? 's' : ''} watching
                </div>
            )}

            {/* Home / Join screen */}
            {!inGame && (
                <div>
                    <div className="card">
                        <div className="section-label">Enter the game</div>
                        <input
                            className="input-field"
                            type="text"
                            placeholder="Your name"
                            value={playerName}
                            onChange={(e) => setPlayerName(e.target.value)}
                        />
                        <input
                            className="input-field"
                            type="text"
                            placeholder="Game ID (optional — leave blank to create)"
                            value={gameId}
                            onChange={(e) => setGameId(e.target.value)}
                        />
                        <div className="btn-row btn-row-top">
                            {gameId.trim() ? (
                                <button onClick={joinGame} className="btn btn-primary btn-full">Join Game</button>
                            ) : (
                                <button onClick={createGame} className="btn btn-primary btn-full">Create Game</button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Waiting room */}
            {gameState === 'waiting' && (
                <div>
                    <div className="card">
                        <div className="players-header">
                            <div className="section-label">Players</div>
                            <span className="count-badge">{players.length}</span>
                        </div>
                        <PlayerList />
                        <hr className="divider" />
                        {isOwner ? (
                            <button onClick={startGame} className="btn btn-primary btn-full">
                                🚀 Start Game
                            </button>
                        ) : (
                            <p className="waiting-hint">⏳ Waiting for the host to start…</p>
                        )}
                    </div>
                </div>
            )}
            {(gameState === 'waiting' || !inGame) && (
                <p className="player-count-tip">🎯 Best played with 3 or more players</p>
            )}

            {/* Ranking phase */}
            {gameState === 'ranking' && !noMoreQuestions && (
                <div>
                    <div className="card">
                        <div className="players-header players-header--mb14">
                            <div className="section-label">Players</div>
                            <span className="count-badge">{players.length}</span>
                        </div>
                        <PlayerList />
                    </div>

                    {isSpectator ? (
                        <p className="waiting-hint">👀 Watching this round — you'll play next round.</p>
                    ) : hasSubmittedRanking ? (
                        <div className="card">
                            <p className="waiting-hint">✅ Ranking submitted! Waiting for others…</p>
                        </div>
                    ) : (
                        <div className="card">
                            <div className="question-card">
                                <div className="question-tag">❓ Your Question</div>
                                <div className="question-text">{myQuestion}</div>
                            </div>

                            {ranking.length > 0 && (
                                <>
                                    <div className="section-label" style={{ marginTop: 16 }}>Your ranking — tap to remove</div>
                                    <div className="player-list" style={{ marginBottom: 12 }}>
                                        {ranking.map((player, index) => (
                                            <div
                                                key={player}
                                                className="player-row"
                                                onClick={() => removeFromRanking(player)}
                                                style={{ cursor: 'pointer' }}
                                            >
                                                <div className="player-score">{index + 1}</div>
                                                <span className="player-name">{player}{player === playerName ? ' (you)' : ''}</span>
                                                <span style={{ marginLeft: 'auto', color: '#e8523a', fontSize: '1rem', fontWeight: 600 }}>✕</span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}

                            {unrankedPlayers.length > 0 && (
                                <>
                                    <div className="section-label" style={{ marginTop: ranking.length > 0 ? 8 : 16 }}>
                                        {ranking.length === 0 ? 'Tap to rank — most likely first' : 'Still to place'}
                                    </div>
                                    <div className="vote-grid" style={{ marginBottom: 12 }}>
                                        {unrankedPlayers.map(player => (
                                            <button
                                                key={player}
                                                onClick={() => tapToRank(player)}
                                                className="vote-btn"
                                            >
                                                {player}{player === playerName ? ' (you)' : ''}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}

                            <button
                                onClick={submitRanking}
                                className={`btn btn-full ${ranking.length === players.length ? 'btn-primary' : 'btn-secondary'}`}
                                style={{ marginTop: 8 }}
                                disabled={ranking.length !== players.length}
                            >
                                {ranking.length === players.length ? 'Submit Ranking' : `Rank all players (${ranking.length}/${players.length})`}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Guessing phase */}
            {gameState === 'guessing' && !noMoreQuestions && (
                <div>
                    <div className="card">
                        <div className="players-header players-header--mb14">
                            <div className="section-label">Players</div>
                            <span className="count-badge">{players.length}</span>
                        </div>
                        <PlayerList />
                    </div>

                    <div className="question-card">
                        <div className="question-tag">❓ {currentRanker}'s Question</div>
                        <div className="question-text">{currentQuestion}</div>
                    </div>

                    <div className="card">
                        <div className="section-label" style={{ marginBottom: 4 }}>
                            Where did <strong>{currentRanker}</strong> rank <strong>{currentTarget}</strong>?
                        </div>
                        <p className="waiting-tip">{guessedPositions.length} / {numGuessers} guesses in</p>

                        {isSpectator ? (
                            <p className="waiting-hint">👀 Watching this round — you'll play next round.</p>
                        ) : playerName === currentRanker ? (
                            <p className="waiting-hint">You're the ranker this round — wait for others to guess!</p>
                        ) : hasSubmittedGuess ? (
                            <p className="waiting-hint">✅ Guess submitted! Waiting for others…</p>
                        ) : (
                            <>
                                <div className="vote-grid" style={{ marginBottom: 12 }}>
                                    {players.map((_, i) => (
                                        <button
                                            key={i + 1}
                                            onClick={() => setSelectedGuess(i + 1)}
                                            className={`vote-btn ${selectedGuess === i + 1 ? 'selected' : ''}`}
                                        >
                                            #{i + 1}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={submitGuess}
                                    className="btn btn-primary btn-full"
                                    disabled={selectedGuess === null}
                                >
                                    Submit Guess
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Reveal phase */}
            {gameState === 'reveal' && !noMoreQuestions && (
                <div>
                    <div className="reveal-imposter">
                        <div className="reveal-imposter-label">{currentTarget} was ranked</div>
                        <div className="reveal-imposter-name">#{actualPosition}</div>
                        <div style={{ fontSize: '0.85rem', color: '#7a8c82', marginTop: 6 }}>
                            by {currentRanker}
                        </div>
                    </div>

                    <div className="card">
                        <div className="question-tag question-tag--mb6">{currentRanker}'s Question</div>
                        <div className="question-text question-text--sm question-text--mb16">{currentQuestion}</div>
                        <div className="section-label">Full Ranking</div>
                        <div className="player-list" style={{ marginTop: 8 }}>
                            {(currentFullRanking || []).map((player, i) => (
                                <div key={player} className={`player-row ${player === currentTarget ? 'is-me' : ''}`}>
                                    <div className="player-score">{i + 1}</div>
                                    <span className="player-name">{player}</span>
                                    {player === currentTarget && (
                                        <span className="player-vote-val">← target</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="card">
                        <div className="section-label" style={{ marginBottom: 12 }}>Guesses</div>
                        <div className="player-list">
                            {players.filter(p => p !== currentRanker).map(player => {
                                const guess = currentGuesses[player];
                                const correct = guess === actualPosition;
                                return (
                                    <div key={player} className={`player-row ${player === playerName ? 'is-me' : ''}`}>
                                        <div className="player-score">{points[player] || 0}</div>
                                        <span className={`player-name ${player === playerName ? 'me' : ''}`}>
                                            {player}{player === playerName ? ' (you)' : ''}
                                        </span>
                                        <span className={correct ? 'player-vote-val' : 'player-guess-val'}>
                                            {guess ? `#${guess}` : '—'} {correct ? '✓' : '✗'}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {isOwner && (
                        <button onClick={nextReveal} className="btn btn-green btn-full">
                            ➡️ Next
                        </button>
                    )}
                    {!isOwner && <p className="waiting-hint">⏳ Waiting for the host to continue…</p>}
                </div>
            )}
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);