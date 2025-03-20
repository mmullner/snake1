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

// 🔢 Spiel nur für diesen Spieler starten
function startGameForPlayer(socket) {
  gameStarted = true;
  socket.emit("gameStart"); // Das Spiel für diesen Spieler starten
  moveSnakes();
}

// 🎮 Neuer Spieler erstellen nach Countdown
io.on("connection", (socket) => {
  console.log(`✅ Spieler verbunden: ${socket.id}`);

  // Wartet auf den Event 'newPlayer', bevor der Spieler ins Spiel kommt
  socket.on("newPlayer", () => {
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

    // Alle anderen Spieler über den neuen Spieler informieren
    io.emit("newPlayer", { id: socket.id, snake });

    socket.emit("init", { players, food });
    startGameForPlayer(socket);
  });

  // ⌨️ Steuerung (PC & Mobile)
  socket.on("keyPress", (key) => {
    const player = players[socket.id];
    if (!player) return;

    if (key === "left") {
      const temp = player.direction.x;
      player.direction.x = player.direction.y;
      player.direction.y = -temp;
    }
    if (key === "right") {
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
