const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");

const gameSpeed = 100; // Konstante Spielgeschwindigkeit in Millisekunden

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: "https://snake-frontend-x8cf.onrender.com",
    methods: ["GET", "POST"],
  }
});

const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.static("public"));

let players = {};
let food = { x: 10, y: 10 };
const gridSize = 20;

let gameStarted = false;
let gameLoop = null;

function getNextPlayerNumber() {
  let num = 1;
  while (Object.values(players).some(p => p.number === num)) {
    num++;
  }
  return num;
}

function getRandomFreePosition() {
  let position;
  let occupiedPositions = new Set();

  Object.values(players).forEach(player => {
    player.body.forEach(segment => {
      occupiedPositions.add(`${segment[0]},${segment[1]}`);
    });
  });

  do {
    position = [Math.floor(Math.random() * gridSize), Math.floor(Math.random() * gridSize)];
  } while (occupiedPositions.has(`${position[0]},${position[1]}`));

  return { x: position[0], y: position[1] };
}

function resetPlayer(playerId) {
  const player = players[playerId];
  if (player) {
    let newStart = getRandomFreePosition();
    player.body = [[newStart.x, newStart.y]];
    player.direction = { x: 1, y: 0 };
    player.score = 0;
    io.to(playerId).emit("init", { snake: player, food });
  }
}

function moveSnakes() {
  let collisions = new Set();
  let newHeads = {};

  for (const playerId in players) {
    const player = players[playerId];
    const newHead = [
      (player.body[0][0] + player.direction.x + gridSize) % gridSize,
      (player.body[0][1] + player.direction.y + gridSize) % gridSize
    ];
    newHeads[playerId] = newHead;
  }

  for (const playerId in players) {
    const player = players[playerId];
    const newHead = newHeads[playerId];

    // Prüfen, ob Kopf mit anderem Kopf kollidiert
    for (const otherId in newHeads) {
      if (otherId !== playerId && newHeads[otherId][0] === newHead[0] && newHeads[otherId][1] === newHead[1]) {
        collisions.add(playerId);
        collisions.add(otherId);
      }
    }

    // Prüfen, ob Kopf mit einem anderen Körper kollidiert
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

    const player = players[playerId];
    const newHead = newHeads[playerId];
    player.body.unshift(newHead);

    if (newHead[0] === food.x && newHead[1] === food.y) {
      player.score += 1;
      food = getRandomFreePosition();
    } else {
      player.body.pop();
    }
  }

  io.emit("gameUpdate", { players, food });
  gameLoop = setTimeout(moveSnakes, gameSpeed);
}

io.on("connection", (socket) => {
  console.log(`✅ Spieler verbunden: ${socket.id}`);

  if (players[socket.id]) {
    delete players[socket.id];
    io.emit("playerLeft", { id: socket.id });
  }

  const playerNumber = getNextPlayerNumber();
  const startPos = getRandomFreePosition();

  let snake = {
    id: socket.id,
    number: playerNumber,
    name: `Spieler ${playerNumber}`,
    direction: { x: 1, y: 0 },
    body: [[startPos.x, startPos.y]],
    score: 0,
    color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
  };

  players[socket.id] = snake;
  socket.emit("init", { snake, food });
  io.emit("newPlayer", { id: socket.id, snake });

  if (!gameStarted) {
    gameStarted = true;
    if (!gameLoop) {
      gameLoop = setTimeout(moveSnakes, gameSpeed);
    }
  }

  socket.on("keyPress", (key) => {
    const player = players[socket.id];
    if (!player) return;

    if (key === "ArrowLeft") {
      const temp = player.direction.x;
      player.direction.x = player.direction.y;
      player.direction.y = -temp;
    }
    if (key === "ArrowRight") {
      const temp = player.direction.x;
      player.direction.x = -player.direction.y;
      player.direction.y = temp;
    }
  });

  socket.on("disconnect", () => {
    console.log(`❌ Spieler ${socket.id} hat das Spiel verlassen`);
    delete players[socket.id];
    io.emit("playerLeft", { id: socket.id });

    if (Object.keys(players).length === 0) {
      gameStarted = false;
      gameLoop = null;
    }
  });
});

server.listen(port, () => {
  console.log(`🚀 Server läuft auf http://localhost:${port}`);
});
