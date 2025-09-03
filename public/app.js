const { useState, useEffect } = React;

const App = () => {
    const [socket, setSocket] = useState(null);
    const [gameId, setGameId] = useState('');
    const [playerName, setPlayerName] = useState('');
    const [isOwner, setIsOwner] = useState(false);
    const [players, setPlayers] = useState([]);
    const [gameState, setGameState] = useState('joining');
    const [myQuestion, setMyQuestion] = useState('');
    const [error, setError] = useState('');
    const [noMoreQuestions, setNoMoreQuestions] = useState(false);
    const [currentRanker, setCurrentRanker] = useState(null);
    const [currentTarget, setCurrentTarget] = useState(null);
    const [currentQuestion, setCurrentQuestion] = useState(null);
    const [currentGuesses, setCurrentGuesses] = useState({});
    const [actualPosition, setActualPosition] = useState(null);
    const [currentFullRanking, setCurrentFullRanking] = useState(null);
    const [points, setPoints] = useState({});
    const [ranking, setRanking] = useState([]);
    const [hasSubmittedRanking, setHasSubmittedRanking] = useState(false);
    const [hasSubmittedGuess, setHasSubmittedGuess] = useState(false);

    useEffect(() => {
        const newSocket = io();
        setSocket(newSocket);

        newSocket.on('gameState', (stateData) => {
            console.log(`Player ${playerName}: Received gameState:`, stateData);
            setGameState(stateData.state);
            setPlayers(stateData.players || []);
            // Update myQuestion only if provided
            if (stateData.myQuestion) {
                setMyQuestion(stateData.myQuestion);
                console.log(`Player ${playerName}: Updated myQuestion to ${stateData.myQuestion}`);
            }
            setIsOwner(playerName === stateData.owner);
            if (stateData.gameId) setGameId(stateData.gameId);
            setNoMoreQuestions(stateData.noMoreQuestions || false);
            setCurrentRanker(stateData.currentRanker || null);
            setCurrentTarget(stateData.currentTarget || null);
            setCurrentQuestion(stateData.currentQuestion || null);
            setCurrentGuesses(stateData.currentGuesses || {});
            setActualPosition(stateData.actualPosition || null);
            setCurrentFullRanking(stateData.currentFullRanking || null);
            setPoints(stateData.points || {});
            // Reset ranking and hasSubmittedRanking for new ranking state
            if (stateData.state === 'ranking') {
                setRanking([...stateData.players].sort(() => Math.random() - 0.5));
                if (stateData.hasSubmittedRanking === false) {
                    setHasSubmittedRanking(false);
                    console.log(`Player ${playerName}: Reset hasSubmittedRanking for new round`);
                }
            }
        });

        newSocket.on('rankingSubmitted', () => {
            setHasSubmittedRanking(true);
            console.log(`Player ${playerName}: Ranking submitted`);
        });

        newSocket.on('error', (message) => {
            setError(message);
            setTimeout(() => setError(''), 5000);
        });

        newSocket.on('connect_error', () => {
            setError('Failed to connect to server');
            setTimeout(() => setError(''), 5000);
        });

        return () => newSocket.disconnect();
    }, [playerName]);

    const createGame = () => {
        if (playerName.trim()) {
            socket.emit('createGame', playerName);
        } else {
            setError('Please enter your name');
            setTimeout(() => setError(''), 5000);
        }
    };

    const joinGame = () => {
        if (playerName.trim() && gameId.trim()) {
            socket.emit('joinGame', { gameId, playerName });
        } else {
            setError('Please enter your name and game ID');
            setTimeout(() => setError(''), 5000);
        }
    };

    const startGame = () => {
        socket.emit('startGame', gameId);
    };

    const submitRanking = () => {
        socket.emit('submitRanking', { gameId, ranking });
    };

    const submitGuess = (guess) => {
        socket.emit('submitGuess', { gameId, guess });
        setHasSubmittedGuess(true);
    };

    const nextReveal = () => {
        socket.emit('nextReveal', gameId);
        setHasSubmittedGuess(false);
    };

    // Drag and drop handlers
    const dragStart = (e, index) => {
        e.dataTransfer.setData('text/plain', index);
    };

    const dragOver = (e) => {
        e.preventDefault();
    };

    const drop = (e, index) => {
        const draggedIndex = parseInt(e.dataTransfer.getData('text/plain'));
        if (draggedIndex === index) return;
        const newRanking = [...ranking];
        const [dragged] = newRanking.splice(draggedIndex, 1);
        newRanking.splice(index, 0, dragged);
        setRanking(newRanking);
    };

    return (
        <div className="container mx-auto p-4 max-w-2xl">
            <h1 className="text-3xl font-bold mb-4 text-center">Guess the Rank Game</h1>
            {gameId && <p className="text-lg mb-2">Game ID: {gameId}</p>}
            {error && <p className="text-red-500 mb-2">{error}</p>}

            {noMoreQuestions && (
                <p className="text-red-500 mb-2">No more unique questions available. Please end the game or start a new one.</p>
            )}

            {gameState === 'joining' && (
                <div className="space-y-4">
                    <input
                        type="text"
                        placeholder="Your Name"
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value)}
                        className="border p-2 w-full rounded"
                    />
                    <input
                        type="text"
                        placeholder="Game ID (leave blank to create)"
                        value={gameId}
                        onChange={(e) => setGameId(e.target.value)}
                        className="border p-2 w-full rounded"
                    />
                    <div className="flex gap-4 justify-center">
                        <button onClick={createGame} className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">Create Game</button>
                        <button onClick={joinGame} className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">Join Game</button>
                    </div>
                </div>
            )}

            {gameState === 'waiting' && (
                <div className="space-y-4">
                    <h2 className="text-2xl font-semibold">Players: {players.length}</h2>
                    <div className="space-y-2">
                        {players.map((player) => (
                            <div key={player} className="text-lg">
                                <span className="font-bold">({points[player] || 0})</span> <span className={player === playerName ? 'underline truncate' : 'truncate'}>{player}</span>
                            </div>
                        ))}
                    </div>
                    {isOwner ? (
                        <button onClick={startGame} className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">Start Game</button>
                    ) : (
                        <p className="text-lg">Waiting for the game owner to start...</p>
                    )}
                </div>
            )}

            {gameState === 'ranking' && !noMoreQuestions && (
                <div className="space-y-4">
                    <h2 className="text-2xl font-semibold">Players: {players.length}</h2>
                    <div className="space-y-2">
                        {players.map((player) => (
                            <div key={player} className="text-lg">
                                <span className="font-bold">({points[player] || 0})</span> <span className={player === playerName ? 'underline truncate' : 'truncate'}>{player}</span>
                            </div>
                        ))}
                    </div>
                    <p className="text-lg"><strong>Rank from most to least likely to {myQuestion.replace('Who is the most likely to ', '')}</strong></p>
                    {!hasSubmittedRanking ? (
                        <div className="space-y-2">
                            {ranking.map((player, index) => (
                                <div
                                    key={player}
                                    draggable
                                    onDragStart={(e) => dragStart(e, index)}
                                    onDragOver={dragOver}
                                    onDrop={(e) => drop(e, index)}
                                    className="bg-gray-200 p-2 rounded cursor-move"
                                >
                                    {index + 1}. {player}
                                </div>
                            ))}
                            <button onClick={submitRanking} className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">Submit Ranking</button>
                        </div>
                    ) : (
                        <p className="text-lg">Waiting for others to finish...</p>
                    )}
                </div>
            )}

            {gameState === 'guessing' && !noMoreQuestions && (
                <div className="space-y-4">
                    <h2 className="text-2xl font-semibold">Players: {players.length}</h2>
                    <div className="space-y-2">
                        {players.map((player) => (
                            <div key={player} className="text-lg">
                                <span className="font-bold">({points[player] || 0})</span> <span className={player === playerName ? 'underline truncate' : 'truncate'}>{player}</span>
                            </div>
                        ))}
                    </div>
                    <p className="text-lg"><strong>{currentRanker}'s question: {currentQuestion}</strong></p>
                    <p className="text-lg"><strong>Guess {currentTarget}'s position (1 = most likely, {players.length} = least likely):</strong></p>
                    {playerName === currentRanker ? (
                        <p className="text-lg">Waiting for others to guess...</p>
                    ) : !hasSubmittedGuess ? (
                        <div className="flex flex-wrap gap-2">
                            {Array.from({ length: players.length }, (_, i) => i + 1).map(pos => (
                                <button
                                    key={pos}
                                    onClick={() => submitGuess(pos)}
                                    className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                                >
                                    {pos}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <p className="text-lg">Waiting for others to finish...</p>
                    )}
                </div>
            )}

            {gameState === 'reveal' && !noMoreQuestions && (
                <div className="space-y-4">
                    <h2 className="text-2xl font-semibold">Players: {players.length}</h2>
                    <div className="space-y-2">
                        {players.map((player) => (
                            <div key={player} className="text-lg">
                                <span className="font-bold">({points[player] || 0})</span> <span className={player === playerName ? 'underline truncate' : 'truncate'}>{player}</span>
                            </div>
                        ))}
                    </div>
                    <p className="text-lg"><strong>{currentRanker}'s question: {currentQuestion}</strong></p>
                    <p className="text-lg"><strong>{currentTarget}'s actual position: {actualPosition}</strong></p>
                    <p className="text-lg"><strong>Full Ranking:</strong></p>
                    <div className="space-y-2">
                        {currentFullRanking && currentFullRanking.map((player, index) => (
                            <div key={player} className="bg-gray-200 p-2 rounded">
                                {index + 1}. {player}
                            </div>
                        ))}
                    </div>
                    {isOwner && (
                        <button onClick={nextReveal} className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">Next</button>
                    )}
                </div>
            )}
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);