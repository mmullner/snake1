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
const speed = 100; // Geschwindigkeit der Bewegung

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

// 🏃 Bewegungsschleife für alle Spieler
function moveSnakes() {
  let occupiedPositions = new Set();

  // Alle Spielerpositionen speichern
  Object.values(players).forEach(player => {
    player.body.forEach(segment => {
      occupiedPositions.add(`${segment[0]},${segment[1]}`);
    });
  });

  for (const playerId in players) {
    const player = players[playerId];

    // Nächste Kopfposition berechnen
    const newHead = [
      (player.body[0][0] + player.direction.x + gridSize) % gridSize,
      (player.body[0][1] + player.direction.y + gridSize) % gridSize
    ];

    // ❌ Prüfen auf Kollision mit sich selbst
    if (player.body.some(segment => segment[0] === newHead[0] && segment[1] === newHead[1])) {
      respawnPlayer(player);
      continue;
    }

    // ❌ Prüfen auf Kollision mit anderen Spielern
    if (occupiedPositions.has(`${newHead[0]},${newHead[1]}`)) {
      respawnPlayer(player);
      continue;
    }

    player.body.unshift(newHead);
    occupiedPositions.add(`${newHead[0]},${newHead[1]}`);

    // 🍏 Essen einsammeln
    if (newHead[0] === food.x && newHead[1] === food.y) {
      player.score += 10;
      food = getRandomFreePosition();
    } else {
      player.body.pop();
    }
  }

  io.emit("gameUpdate", { players, food });
  setTimeout(moveSnakes, speed);
}

// 🔄 Spieler respawnen nach Tod
function respawnPlayer(player) {
  console.log(`💀 Spieler ${player.number} ist gestorben! Respawn...`);
  let newStart = getRandomFreePosition();
  player.body = [[newStart.x, newStart.y]];
  player.direction = { x: 1, y: 0 };
  player.score = 0;
}

io.on("connection", (socket) => {
  console.log(`✅ Spieler verbunden: ${socket.id}`);

  // Neuen Spieler erstellen
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
    moveSnakes();
  }

  // ⌨️ Steuerung (PC & Mobile)
  socket.on("keyPress", (key) => {
    const player = players[socket.id];
    if (!player) return;

    if (key === "ArrowLeft") {
      // Linksdrehung (gegen den Uhrzeigersinn)
      const temp = player.direction.x;
      player.direction.x = player.direction.y;
      player.direction.y = -temp;
    }
    if (key === "ArrowRight") {
      // Rechtsdrehung (im Uhrzeigersinn)
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
