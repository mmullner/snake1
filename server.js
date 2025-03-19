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
    allowedHeaders: ["Content-Type"],
    credentials: true,
  }
});

const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.static("public"));

let players = {};
let food = { x: 10, y: 10 };
const gridSize = 20;

// Erstfreie Spielernummer finden
function getNextPlayerNumber() {
  let num = 1;
  while (Object.values(players).some(p => p.number === num)) {
    num++;
  }
  return num;
}

// Zufällige Position finden
function getRandomFreePosition() {
  let position;
  do {
    position = [Math.floor(Math.random() * gridSize), Math.floor(Math.random() * gridSize)];
  } while (Object.values(players).some(player =>
    player.body.some(segment => segment[0] === position[0] && segment[1] === position[1])
  ));
  return position;
}

// Zufällige Farbe generieren
function getRandomColor() {
  return `#${Math.floor(Math.random()*16777215).toString(16)}`;
}

// Bewegungsschleife
function moveSnakes() {
  for (const playerId in players) {
    const player = players[playerId];

    // Kopf berechnen
    const newHead = [player.body[0][0] + player.direction.x, player.body[0][1] + player.direction.y];

    // Randüberquerung erlauben (Teleportation)
    newHead[0] = (newHead[0] + gridSize) % gridSize;
    newHead[1] = (newHead[1] + gridSize) % gridSize;

    player.body.unshift(newHead);

    // Kollision mit sich selbst
    if (player.body.slice(1).some(segment => segment[0] === newHead[0] && segment[1] === newHead[1])) {
      console.log(`Spieler ${player.number} ist gestorben! Respawn...`);
      player.body = [getRandomFreePosition()];
      player.direction = { x: 1, y: 0 };
      player.score = 0;
    } else {
      player.body.pop();
    }

    // Essen
    if (newHead[0] === food.x && newHead[1] === food.y) {
      player.body.push([...player.body[player.body.length - 1]]);
      player.score += 10;
      food = getRandomFreePosition();
    }
  }

  io.emit("gameUpdate", { players, food });
  setTimeout(moveSnakes, 100);
}

io.on("connection", (socket) => {
  console.log(`Spieler verbunden: ${socket.id}`);

  // Entferne vorherigen Spieler falls existiert (bei Seiten-Refresh)
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
    body: [startPos, [startPos[0] - 1, startPos[1]], [startPos[0] - 2, startPos[1]]],
    score: 0,
    color: getRandomColor(),
  };

  players[socket.id] = snake;

  socket.emit("init", { snake, food });
  io.emit("newPlayer", { id: socket.id, snake });

  if (Object.keys(players).length === 1) {
    moveSnakes();
  }

  socket.on("keyPress", (key) => {
    const player = players[socket.id];
    if (!player) return;

    if (key === "ArrowLeft" || key === "KeyA") {
      const temp = player.direction.x;
      player.direction.x = player.direction.y;
      player.direction.y = -temp;
    }
    if (key === "ArrowRight" || key === "KeyD") {
      const temp = player.direction.x;
      player.direction.x = -player.direction.y;
      player.direction.y = temp;
    }
  });

  socket.on("disconnect", () => {
    console.log(`Spieler ${socket.id} hat das Spiel verlassen`);
    delete players[socket.id];
    io.emit("playerLeft", { id: socket.id });
  });
});

server.listen(port, () => {
  console.log(`Server läuft auf http://localhost:${port}`);
});
