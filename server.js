const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const axios = require('axios');
const os = require('os');
const stringSimilarity = require('string-similarity');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static('public'));
app.get('/app.js', (req, res) => {
    console.log(`Serving app.js from: public/app.js`);
    res.sendFile('app.js', { root: 'public' }, (err) => {
        if (err) {
            console.error(`Error serving app.js: ${err}`);
            res.status(404).send('app.js not found');
        }
    });
});
app.get('/', (req, res) => {
    console.log(`Serving index.html`);
    res.sendFile('index.html', { root: 'public' });
});

const games = {};
let questionPool = [];
try {
    const data = fs.readFileSync('questions.json', 'utf8');
    const parsed = JSON.parse(data);
    questionPool = [...new Set(parsed.flatMap(q => [q.question, q.specialQuestion]))];
    console.log(`Loaded ${questionPool.length} unique questions from questions.json`);
} catch (err) {
    console.error('Error loading questions.json:', err.message);
    questionPool = [];
}

const fallbackQuestions = [
    "Who is the most likely to become a famous inventor?",
    "Who is the most likely to forget their own birthday?",
    "Who is the most likely to win a marathon?",
    "Who is the most likely to trip over their own shoelaces?",
    "Who is the most likely to start a successful company?",
    "Who is the most likely to lose their keys in their own house?"
];

function generateGameId() {
    return Math.random().toString(36).substring(2, 9);
}

const globalUsedQuestions = new Set();
const questionCache = [];

async function selectQuestion(gameId) {
    const game = games[gameId];
    if (!game) {
        console.error(`Game ${gameId}: Game not found`);
        return null;
    }

    if (!process.env.GROQ_API_KEY) {
        console.error(`Game ${gameId}: GROQ_API_KEY not set, falling back to question pool`);
        return selectFromQuestionPool(gameId, game);
    }

    const usedQuestions = game.usedQuestions || new Set();
    game.usedQuestions = usedQuestions;
    const maxRetries = 10;

    console.log(`Game ${gameId}: Free memory: ${os.freemem() / 1024 / 1024} MB, Total memory: ${os.totalmem() / 1024 / 1024} MB`);

    // Check cache
    while (questionCache.length > 0) {
        const cachedQuestion = questionCache.shift();
        if (!usedQuestions.has(cachedQuestion) && !globalUsedQuestions.has(cachedQuestion)) {
            usedQuestions.add(cachedQuestion);
            globalUsedQuestions.add(cachedQuestion);
            console.log(`Game ${gameId}: Used cached question: ${cachedQuestion}`);
            return cachedQuestion;
        }
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const timestamp = Date.now();
            const randomSeed = `${timestamp}-${Math.random().toString(36).substring(2)}`;
            const examples = fallbackQuestions
                .sort(() => Math.random() - 0.5)
                .slice(0, 3)
                .map((ex, i) => `Example ${i + 1}: {"question": "${ex}"}`)
                .join('\n');

            const prompt = `
        You are a game question generator. Return ONLY a valid JSON object with one field: "question". The "question" must be phrased as "Who is the most likely to..." and can be either positive/aspirational or humorous/quirky. Generate highly unique and varied questions, avoiding any repetition or similarity to previous outputs, examples, or common themes. Do NOT include any text, markdown, backticks, code blocks, comments, explanations, or conversational responses. If you cannot generate the requested output, return an empty JSON object {}.
        Examples:
        ${examples}
        Random seed for uniqueness: ${randomSeed}
        Output: {"question": "<your unique question>"}
      `;

            console.log(`Game ${gameId}: Sending prompt to Groq API (attempt ${attempt})`);

            const response = await axios.post(
                'https://api.groq.com/openai/v1/chat/completions',
                {
                    model: 'llama-3.3-70b-versatile',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 500,
                    temperature: 1.2,
                    top_p: 1.0,
                    frequency_penalty: 0.5,
                    presence_penalty: 0.5
                },
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            let responseText = response.data.choices[0]?.message?.content || '{}';
            console.log(`Game ${gameId}: Raw response: ${responseText}`);

            responseText = responseText.replace(/```json\n|```\n/g, '').trim();
            console.log(`Game ${gameId}: Cleaned response: ${responseText}`);

            if (responseText === '{}' || !responseText.trim()) {
                console.error(`Game ${gameId}: Empty or invalid response from Groq API (attempt ${attempt})`);
                continue;
            }

            let questionData;
            try {
                questionData = JSON.parse(responseText);
                if (!questionData.question) {
                    throw new Error('Missing required field in JSON');
                }
                if (!questionData.question.startsWith('Who is the most likely to')) {
                    throw new Error('Question does not follow required format');
                }
            } catch (parseError) {
                console.error(`Game ${gameId}: JSON parse error: ${parseError.message}`);
                continue;
            }

            const questionKey = questionData.question;

            if (usedQuestions.has(questionKey) || globalUsedQuestions.has(questionKey)) {
                console.log(`Game ${gameId}: Generated question is a duplicate, retrying (${attempt}/${maxRetries})`);
                continue;
            }

            let isSimilar = false;
            for (const existingKey of globalUsedQuestions) {
                const similarity = stringSimilarity.compareTwoStrings(questionKey, existingKey);
                if (similarity > 0.7) {
                    isSimilar = true;
                    console.log(`Game ${gameId}: Question too similar to existing (${existingKey}), similarity: ${similarity}. Retrying (${attempt}/${maxRetries})`);
                    break;
                }
            }

            if (isSimilar) {
                continue;
            }

            questionCache.push(questionKey);
            usedQuestions.add(questionKey);
            globalUsedQuestions.add(questionKey);
            console.log(`Game ${gameId}: Generated question: ${questionKey}`);
            return questionKey;
        } catch (error) {
            console.error(`Game ${gameId}: Error generating question with Groq API (attempt ${attempt}):`, {
                message: error.message,
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data
            });
        }
    }

    console.log(`Game ${gameId}: Falling back to question pool after ${maxRetries} attempts`);
    return selectFromQuestionPool(gameId, game);
}

function selectFromQuestionPool(gameId, game) {
    const usedQuestions = game.usedQuestions || new Set();
    const availableQuestions = questionPool.filter(
        q => !usedQuestions.has(q) && !globalUsedQuestions.has(q)
    );

    if (availableQuestions.length === 0) {
        const availableFallbacks = fallbackQuestions.filter(
            q => !usedQuestions.has(q) && !globalUsedQuestions.has(q)
        );
        if (availableFallbacks.length > 0) {
            const randomIndex = Math.floor(Math.random() * availableFallbacks.length);
            const selectedQuestion = availableFallbacks[randomIndex];
            usedQuestions.add(selectedQuestion);
            globalUsedQuestions.add(selectedQuestion);
            console.log(`Game ${gameId}: Using fallback question: ${selectedQuestion}`);
            return selectedQuestion;
        }
        console.log(`Game ${gameId}: No more unique questions available`);
        io.to(gameId).emit('gameState', { ...game, noMoreQuestions: true });
        return null;
    }

    const randomIndex = Math.floor(Math.random() * availableQuestions.length);
    const selectedQuestion = availableQuestions[randomIndex];
    usedQuestions.add(selectedQuestion);
    globalUsedQuestions.add(selectedQuestion);
    console.log(`Game ${gameId}: Selected question from pool: ${selectedQuestion}`);
    return selectedQuestion;
}

async function assignQuestions(gameId) {
    const game = games[gameId];
    const numPlayers = game.players.length;
    const questions = [];
    for (let i = 0; i < numPlayers; i++) {
        const q = await selectQuestion(gameId);
        if (!q) {
            console.error(`Game ${gameId}: Failed to select question for player ${i + 1}`);
            return false;
        }
        questions.push(q);
    }
    // Shuffle and assign
    questions.sort(() => Math.random() - 0.5);
    game.questionAssignments = {};
    game.rankings = {};
    game.rankers = [...game.players].sort(() => Math.random() - 0.5);
    game.currentRevealIndex = 0;
    game.players.forEach((player, idx) => {
        game.questionAssignments[player] = questions[idx];
        console.log(`Game ${gameId}: Assigned question to ${player}: ${questions[idx]}`);
    });
    return true;
}

io.on('connection', (socket) => {
    socket.on('createGame', (playerName) => {
        const gameId = generateGameId();
        games[gameId] = {
            players: [playerName],
            points: { [playerName]: 0 },
            state: 'waiting',
            owner: playerName,
            usedQuestions: new Set(),
            questionAssignments: {},
            rankings: {},
            currentRanker: null,
            currentTarget: null,
            currentQuestion: null,
            currentGuesses: {},
            actualPosition: null,
            currentFullRanking: null,
            rankers: [],
            currentRevealIndex: 0,
            noMoreQuestions: false
        };
        socket.join(gameId);
        socket.playerName = playerName;
        socket.emit('gameState', { ...games[gameId], gameId });
    });

    socket.on('joinGame', ({ gameId, playerName }) => {
        if (!games[gameId]) {
            socket.emit('error', 'Game not found');
            return;
        }
        if (games[gameId].players.includes(playerName)) {
            socket.emit('error', 'Name already taken');
            return;
        }
        games[gameId].players.push(playerName);
        games[gameId].points[playerName] = 0;
        games[gameId].state = 'waiting';
        socket.join(gameId);
        socket.playerName = playerName;
        io.to(gameId).emit('gameState', games[gameId]);
    });

    socket.on('startGame', async (gameId) => {
        if (!games[gameId] || games[gameId].owner !== socket.playerName) {
            socket.emit('error', 'Only the game owner can start the game');
            return;
        }
        const game = games[gameId];
        const success = await assignQuestions(gameId);
        if (!success) {
            socket.emit('error', 'No more unique questions available.');
            return;
        }
        game.state = 'ranking';
        game.players.forEach(player => {
            const playerSocket = Array.from(io.sockets.sockets.values())
                .find(s => s.playerName === player && s.rooms.has(gameId));
            if (playerSocket) {
                playerSocket.emit('gameState', {
                    ...game,
                    myQuestion: game.questionAssignments[player]
                });
            }
        });
    });

    socket.on('submitRanking', ({ gameId, ranking }) => {
        if (!games[gameId] || !games[gameId].players.includes(socket.playerName)) return;
        const game = games[gameId];
        if (game.state !== 'ranking') return;
        if (ranking.length !== game.players.length || !ranking.every(p => game.players.includes(p))) {
            socket.emit('error', 'Invalid ranking');
            return;
        }
        game.rankings[socket.playerName] = ranking;
        console.log(`Game ${gameId}: ${socket.playerName} submitted ranking`);
        socket.emit('rankingSubmitted', true);
        if (Object.keys(game.rankings).length === game.players.length) {
            setNextReveal(gameId);
        }
    });

    function setNextReveal(gameId) {
        const game = games[gameId];
        if (game.currentRevealIndex >= game.players.length) {
            startNewRound(gameId);
            return;
        }
        const ranker = game.rankers[game.currentRevealIndex];
        const target = game.players[Math.floor(Math.random() * game.players.length)];
        game.currentRanker = ranker;
        game.currentTarget = target;
        game.currentQuestion = game.questionAssignments[ranker];
        game.currentGuesses = {};
        game.actualPosition = game.rankings[ranker].indexOf(target) + 1;
        game.currentFullRanking = null;
        game.state = 'guessing';
        console.log(`Game ${gameId}: Starting guess for ranker ${ranker}, target ${target}`);
        game.players.forEach(player => {
            const playerSocket = Array.from(io.sockets.sockets.values())
                .find(s => s.playerName === player && s.rooms.has(gameId));
            if (playerSocket) {
                playerSocket.emit('gameState', {
                    ...game,
                    myQuestion: game.questionAssignments[player],
                    hasSubmittedGuess: false
                });
            }
        });
    }

    async function startNewRound(gameId) {
        const game = games[gameId];
        console.log(`Game ${gameId}: Starting new round`);
        const success = await assignQuestions(gameId);
        if (!success) {
            console.error(`Game ${gameId}: No more unique questions available for new round`);
            io.to(gameId).emit('gameState', { ...game, noMoreQuestions: true });
            return;
        }
        game.state = 'ranking';
        game.rankings = {};
        game.currentRanker = null;
        game.currentTarget = null;
        game.currentQuestion = null;
        game.currentGuesses = {};
        game.actualPosition = null;
        game.currentFullRanking = null;
        game.players.forEach(player => {
            const playerSocket = Array.from(io.sockets.sockets.values())
                .find(s => s.playerName === player && s.rooms.has(gameId));
            if (playerSocket) {
                playerSocket.emit('gameState', {
                    ...game,
                    myQuestion: game.questionAssignments[player] || '',
                    hasSubmittedRanking: false,
                    hasSubmittedGuess: false
                });
                console.log(`Game ${gameId}: Sent new question to ${player}: ${game.questionAssignments[player]}`);
            } else {
                console.error(`Game ${gameId}: No socket found for player ${player}`);
            }
        });
    }

    socket.on('submitGuess', ({ gameId, guess }) => {
        if (!games[gameId] || !games[gameId].players.includes(socket.playerName)) return;
        const game = games[gameId];
        if (game.state !== 'guessing') return;
        if (socket.playerName === game.currentRanker) {
            socket.emit('error', 'You cannot guess as the ranker');
            return;
        }
        if (guess < 1 || guess > game.players.length) {
            socket.emit('error', 'Invalid guess');
            return;
        }
        game.currentGuesses[socket.playerName] = guess;
        console.log(`Game ${gameId}: ${socket.playerName} guessed position ${guess}`);
        const nonRankerPlayers = game.players.filter(p => p !== game.currentRanker);
        if (Object.keys(game.currentGuesses).length === nonRankerPlayers.length) {
            // Award points
            let correctGuessCount = 0;
            Object.keys(game.currentGuesses).forEach(guesser => {
                if (game.currentGuesses[guesser] === game.actualPosition) {
                    game.points[guesser] = (game.points[guesser] || 0) + 1; // 1 point for correct guess
                    correctGuessCount++;
                }
            });
            // Award ranker points: 1 per correct guess, capped at 3
            const rankerPoints = Math.min(correctGuessCount, 3);
            game.points[game.currentRanker] = (game.points[game.currentRanker] || 0) + rankerPoints;
            console.log(`Game ${gameId}: Awarded ${rankerPoints} points to ranker ${game.currentRanker} (${correctGuessCount} correct guesses)`);
            game.players.sort((a, b) => (game.points[b] || 0) - (game.points[a] || 0));
            game.currentFullRanking = game.rankings[game.currentRanker];
            game.state = 'reveal';
            game.players.forEach(player => {
                const playerSocket = Array.from(io.sockets.sockets.values())
                    .find(s => s.playerName === player && s.rooms.has(gameId));
                if (playerSocket) {
                    playerSocket.emit('gameState', {
                        ...game,
                        myQuestion: game.questionAssignments[player],
                        hasSubmittedGuess: false
                    });
                }
            });
        } else {
            io.to(gameId).emit('gameState', {
                ...game,
                myQuestion: game.questionAssignments[socket.playerName]
            });
        }
    });

    socket.on('nextReveal', (gameId) => {
        if (!games[gameId] || games[gameId].owner !== socket.playerName) {
            socket.emit('error', 'Only the game owner can advance');
            return;
        }
        const game = games[gameId];
        if (game.state !== 'reveal') return;
        game.currentRevealIndex += 1;
        setNextReveal(gameId);
    });

    socket.on('disconnect', () => {
        for (const gameId in games) {
            const game = games[gameId];
            const index = game.players.indexOf(socket.playerName);
            if (index !== -1) {
                game.players.splice(index, 1);
                delete game.points[socket.playerName];
                delete game.questionAssignments[socket.playerName];
                delete game.rankings[socket.playerName];
                if (game.players.length === 0) {
                    delete games[gameId];
                } else {
                    game.state = game.players.length > 1 ? 'waiting' : 'joining';
                    game.players.sort((a, b) => (game.points[b] || 0) - (game.points[a] || 0));
                    io.to(gameId).emit('gameState', game);
                }
            }
        }
    });

    socket.on('error', (err) => {
        console.error('Socket error:', err);
    });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});