const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: "https://snake-frontend-x8cf.onrender.com", // Passe dies an die URL deiner Frontend-App an
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
let countdownInProgress = false; // Flag, das angibt, ob der Countdown läuft
let moveInterval; // Verhindert mehrfaches Starten der Bewegungsschleife

// 🎮 Countdown für Respawn oder Spielstart
function startCountdown(isRespawn = false) {
  if (countdownInProgress) return; // Verhindert mehrfachen Countdown

  let countdown = 3;
  countdownInProgress = true; // Countdown läuft

  const interval = setInterval(() => {
    io.emit("countdown", countdown); // Alle Spieler erhalten den Countdown
    countdown--;

    if (countdown < 0) {
      clearInterval(interval);
      countdownInProgress = false; // Countdown abgeschlossen

      if (isRespawn) {
        // Spieler respawnen
        Object.values(players).forEach(player => respawnPlayerAfterCountdown(player));
      } else {
        // Spiel starten
        startGame();
      }
    }
  }, 1000);
}

// 🎮 Spiel starten
function startGame() {
  gameStarted = true;

  if (!moveInterval) {
    moveInterval = setInterval(moveSnakes, speed); // Bewegungsschleife starten
  }
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
      respawnPlayerAfterCountdown(player);  // Spieler respawnen
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

// 🎮 Neue Spieler-Nummer suchen
function getNextPlayerNumber() {
  let num = 1;
  while (Object.values(players).some(p => p.number === num)) {
    num++;
  }
  return num;
}

// 📍 Zufällige Position für das Essen generieren
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

// 🎮
