const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");

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
const speed = 180; // Geschwindigkeit der Bewegung

let gameStarted = false;

// 🎮 Erstfreie Spielernummer suchen
function getNextPlayerNumber() {
  let num = 1;
  while (Object.values(players).some(p => p.number === num)) {
    num++;
  }
  return num;
}

// 📍 Freie Position berechnen (keine Kollision mit Spielern)
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


// 🔄 Spieler nach dem Countdown respawnen
function respawnPlayerAfterCountdown(player) {
  const newStartPos = getRandomFreePosition();

  // Neuer Spieler-Objekt erstellen
  const newSnake = {
    id: player.id,
    number: player.number,
    name: player.name,
    direction: { x: 1, y: 0 },
    body: [[newStartPos.x, newStartPos.y]],
    score: 0,
    color: player.color, // Spielerfarbe beibehalten
  };

  // Den Spieler wieder hinzufügen
  players[player.id] = newSnake;

  // Das Spiel mit dem neuen Spielerstatus aktualisieren
  io.emit("newPlayer", { id: player.id, snake: newSnake });
  io.emit("gameUpdate", { players, food });
}

// 🔢 Countdown für Respawn oder Spielstart
function startCountdown(player, isRespawn = false) {
  let countdown = 3;
  const interval = setInterval(() => {
    io.to(player.id).emit("countdown", countdown);
    countdown--;

    if (countdown < 0) {
      clearInterval(interval);
      if (isRespawn) {
        respawnPlayerAfterCountdown(player);
      } else {
        startGame();
      }
    }
  }, 1000);
}

// 🔄 Spieler respawnen nach Tod
function respawnPlayer(player) {
  console.log(`💀 Spieler ${player.number} ist gestorben! Respawn...`);

  // Spieler sofort entfernen
  delete players[player.id];
  io.emit("playerLeft", { id: player.id });

  // Countdown starten
  startCountdown(player, true);
}


// 🎮 Spiel starten
function startGame() {
  gameStarted = true;
  moveSnakes();
}

// 🏃 Bewegungsschleife für alle Spieler
function moveSnakes() {
  let occupiedPositions = new Set();

  Object.values(players).forEach(player => {
    player.body.forEach(segment => {
      occupiedPositions.add(`${segment[0]},${segment[1]}`);
    });
  });

  for (const playerId in players) {
    const player = players[playerId];

    const newHead = [
      (player.body[0][0] + player.direction.x + gridSize) % gridSize,
      (player.body[0][1] + player.direction.y + gridSize) % gridSize
    ];

    // ❌ Prüfen auf Kollision mit sich selbst oder anderen Spielern
    if (player.body.some(segment => segment[0] === newHead[0] && segment[1] === newHead[1]) ||
        occupiedPositions.has(`${newHead[0]},${newHead[1]}`)) {
      respawnPlayer(player);  // Direkter Aufruf der Respawn-Logik
      continue;
    }

    player.body.unshift(newHead);
    occupiedPositions.add(`${newHead[0]},${newHead[1]}`);

    // 🍏 Essen einsammeln
    if (newHead[0] === food.x && newHead[1] === food.y) {
      player.score += 1;
      food = getRandomFreePosition();
    } else {
      player.body.pop();
    }
  }

  io.emit("gameUpdate", { players, food });
  setTimeout(moveSnakes, speed);
}

io.on("connection", (socket) => {
  console.log(`✅ Spieler verbunden: ${socket.id}`);

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
  io.emit("newPlayer", { id:
