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
let countdownInProgress = false; // Flag, das angibt, ob der Countdown läuft

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

// 🔢 Countdown für einen einzelnen Spieler starten
function startCountdownForPlayer(socket, isRespawn = false) {
  let countdown = 3;

  const interval = setInterval(() => {
    socket.emit("countdown", countdown); // Countdown nur für diesen Spieler senden
    countdown--;

    if (countdown < 0) {
      clearInterval(interval);
      if (isRespawn) {
        // Spieler respawnen
        respawnPlayerAfterCountdown(socket);
      } else {
        // Spiel für den Spieler starten
        startGameForPlayer(socket);
      }
    }
  }, 1000);
}

// 🎮 Spiel nur für diesen Spieler starten
function startGameForPlayer(socket) {
  gameStarted = true;
  socket.emit("gameStart"); // Das Spiel für diesen Spieler starten
  moveSnakes();
}

// 🔄 Spieler nach dem Countdown respawnen
function respawnPlayerAfterCountdown(socket) {
  const player = players[socket.id];
  if (!player) return;

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
  players[socket.id] = newSnake;

  // Das Spiel mit dem neuen Spielerstatus aktualisieren
  io.emit("newPlayer", { id: socket.id, snake: newSnake });
  io.emit("gameUpdate", { players, food });
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
  io.emit("newPlayer", { id: socket.id, snake });

  // Countdown nur für den neuen Spieler starten
  console.log("Starte Countdown für den neuen Spieler...");
  startCountdownForPlayer(socket);

  // ⌨️ Steuerung (PC & Mobile)
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
    }
  });
});

server.listen(port, () => {
  console.log(`🚀 Server läuft auf http://localhost:${port}`);
});
