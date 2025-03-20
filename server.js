const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");

const gameSpeed = 180; // Konstante Spielgeschwindigkeit in Millisekunden
const gridSize = 20;

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "https://snake-frontend-x8cf.onrender.com",
    methods: ["GET", "POST"],
  },
  pingInterval: 1000,
  pingTimeout: 3000,
});

const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.static("public"));

let players = {};
let food = []; // Food als Array
const numberOfFoodItems = 3; // Anzahl der Food-Objekte im Spiel
let gameLoop = null;

function getNextPlayerNumber() {
  let num = 1;
  while (Object.values(players).some(p => p.number === num)) {
    num++;
  }
  return num;
}

function getRandomFreePosition() {
  let occupied = new Set();
  Object.values(players).forEach(player =>
    player.body.forEach(segment => occupied.add(`${segment[0]},${segment[1]}`))
  );

  let position;
  do {
    position = [Math.floor(Math.random() * gridSize), Math.floor(Math.random() * gridSize)];
  } while (occupied.has(`${position[0]},${position[1]}`));

  return { x: position[0], y: position[1] };
}

function resetPlayer(playerId) {
  if (!players[playerId]) return;
  let newStart = getRandomFreePosition();
  players[playerId] = {
    ...players[playerId],
    body: [[newStart.x, newStart.y]],
    direction: { x: 1, y: 0 },
    score: 0,
  };
  io.to(playerId).emit("init", { snake: players[playerId], food });
}

function generateFood() {
  food = [];
  for (let i = 0; i < numberOfFoodItems; i++) {
    food.push(getRandomFreePosition());
  }
}

function moveSnakes() {
  let newHeads = {};
  let collisions = new Set();

  for (const playerId in players) {
    const player = players[playerId];
    const newHead = [(player.body[0][0] + player.direction.x + gridSize) % gridSize,
                     (player.body[0][1] + player.direction.y + gridSize) % gridSize];
    newHeads[playerId] = newHead;
  }

  for (const playerId in players) {
    const newHead = newHeads[playerId];
    for (const otherId in newHeads) {
      if (otherId !== playerId && newHeads[otherId][0] === newHead[0] && newHeads[otherId][1] === newHead[1]) {
        collisions.add(playerId);
        collisions.add(otherId);
      }
    }
    for (const otherId in players) {
      if (players[otherId].body.some(segment => segment[0] === newHead[0] && segment[1] === newHead[1])) {
        collisions.add(playerId);
      }
    }
  }

  for (const playerId of collisions) {
    console.log(`💀 Spieler ${players[playerId].number} ist gestorben! Reset...`);
    resetPlayer(playerId);
  }

  for (const playerId in players) {
    if (collisions.has(playerId)) continue;
    players[playerId].body.unshift(newHeads[playerId]);

    // Überprüfen, ob der Kopf des Spielers auf einem Food-Objekt ist
    food.forEach((f, index) => {
      if (newHeads[playerId][0] === f.x && newHeads[playerId][1] === f.y) {
        players[playerId].score++;
        // Food-Objekt neu platzieren
        food[index] = getRandomFreePosition();
      }
    });

    // Wenn der Spieler nichts frisst, wird das letzte Segment des Körpers entfernt
    if (!food.some(f => newHeads[playerId][0] === f.x && newHeads[playerId][1] === f.y)) {
      players[playerId].body.pop();
    }
  }

  io.emit("gameUpdate", { players, food });
}

io.on("connection", (socket) => {
  console.log(`✅ Spieler verbunden: ${socket.id}`);

  if (players[socket.id]) {
    delete players[socket.id];
    io.emit("playerLeft", { id: socket.id });
  }

  const playerNumber = getNextPlayerNumber();
  const startPos = getRandomFreePosition();

  players[socket.id] = {
    id: socket.id,
    number: playerNumber,
    name: `Player ${playerNumber}`,
    direction: { x: 1, y: 0 },
    body: [[startPos.x, startPos.y]],
    score: 0,
    color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
  };

  socket.emit("init", { snake: players[socket.id], food });
  io.emit("newPlayer", { id: socket.id, snake: players[socket.id] });

  if (!gameLoop) gameLoop = setInterval(moveSnakes, gameSpeed);

  socket.on("keyPress", (key) => {
    const player = players[socket.id];
    if (!player) return;
    if (key === "ArrowLeft") [player.direction.x, player.direction.y] = [player.direction.y, -player.direction.x];
    if (key === "ArrowRight") [player.direction.x, player.direction.y] = [-player.direction.y, player.direction.x];
  });

  socket.on("disconnect", () => {
    console.log(`❌ Spieler ${socket.id} hat das Spiel verlassen`);
    delete players[socket.id];
    io.emit("playerLeft", { id: socket.id });
    if (Object.keys(players).length === 0) {
      clearInterval(gameLoop);
      gameLoop = null;
    }
  });
});

generateFood(); // Initialisiere die Food-Objekte zu Spielbeginn
server.listen(port, () => {
  console.log(`🚀 Server läuft auf http://localhost:${port}`);
});
