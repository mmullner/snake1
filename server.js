const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");

const gameSpeed = 180; // Konstante Spielgeschwindigkeit in Millisekunden
const gridSize = 20;
const foodNumber = 3; // Konstante Anzahl an Food-Objekten

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
let foods = [];
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

// Funktion zur Generierung von Food-Objekten
function generateFoods() {
  foods = [];
  for (let i = 0; i < foodNumber; i++) {
    foods.push(getRandomFreePosition());
  }
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
  io.to(playerId).emit("init", { snake: players[playerId], foods });
}

function moveSnakes() {
  let newHeads = {};
  let collisions = new Set();

  // Berechnung der neuen Positionen der Schlangen
  for (const playerId in players) {
    const player = players[playerId];
    const newHead = [(player.body[0][0] + player.direction.x + gridSize) % gridSize,
                     (player.body[0][1] + player.direction.y + gridSize) % gridSize];
    newHeads[playerId] = newHead;
  }

  // Kollisionserkennung
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

  // Kollisionen bearbeiten
  for (const playerId of collisions) {
    console.log(`💀 Spieler ${players[playerId].number} ist gestorben! Reset...`);
    resetPlayer(playerId);
  }

  // Bewegung der Schlangen und Food-Essen
  for (const playerId in players) {
    if (collisions.has(playerId)) continue;
    players[playerId].body.unshift(newHeads[playerId]);

    // Prüfen, ob die Schlange ein Food-Objekt eingesammelt hat
    let foodEaten = false;
    foods.forEach((food, index) => {
      if (newHeads[playerId][0] === food.x && newHeads[playerId][1] === food.y) {
        players[playerId].score++;
        foods[index] = getRandomFreePosition(); // Neues Food-Objekt an der zufälligen Position
        foodEaten = true;
      }
    });

    // Falls kein Food gegessen wurde, entferne den letzten Segment der Schlange
    if (!foodEaten) {
      players[playerId].body.pop();
    }
  }

  io.emit("gameUpdate", { players, foods });
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

  generateFoods();  // Erstelle die initiale Menge an Food-Objekten
  socket.emit("init", { snake: players[socket.id], foods });
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

server.listen(port, () => {
  console.log(`🚀 Server läuft auf http://localhost:${port}`);
});
