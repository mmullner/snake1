const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const port = process.env.PORT || 3000;
app.use(cors());

let players = {};
let food = { x: 10, y: 10 };
let playerCount = 0;

const DIRECTIONS = [
  { x: 1, y: 0 },  // Rechts
  { x: 0, y: 1 },  // Unten
  { x: -1, y: 0 }, // Links
  { x: 0, y: -1 }, // Oben
];

function getRandomPosition() {
  return [Math.floor(Math.random() * 20), Math.floor(Math.random() * 20)];
}

function spawnFood() {
  food = { x: Math.floor(Math.random() * 20), y: Math.floor(Math.random() * 20) };
}

function moveSnakes() {
  for (const playerId in players) {
    let player = players[playerId];

    // Bewege die Schlange
    let newHead = [player.body[0][0] + player.direction.x, player.body[0][1] + player.direction.y];

    // Wände überspringen (endloses Spielfeld)
    newHead[0] = (newHead[0] + 20) % 20;
    newHead[1] = (newHead[1] + 20) % 20;

    // Kollision mit sich selbst oder anderen Spielern prüfen
    let collided = Object.values(players).some(otherPlayer =>
      otherPlayer.body.some(segment => segment[0] === newHead[0] && segment[1] === newHead[1])
    );

    if (collided) {
      console.log(`${player.name} ist gestorben!`);
      player.body = [getRandomPosition()];
      player.direction = { x: 1, y: 0 };
      player.score = 0;
      continue;
    }

    // Neue Position setzen
    player.body.unshift(newHead);
    if (newHead[0] === food.x && newHead[1] === food.y) {
      player.score += 10;
      spawnFood();
    } else {
      player.body.pop();
    }
  }

  io.emit("gameUpdate", { players, food });
  setTimeout(moveSnakes, 200);
}

io.on("connection", (socket) => {
  console.log("Spieler verbunden:", socket.id);
  playerCount++;

  players[socket.id] = {
    id: socket.id,
    name: `Spieler ${playerCount}`,
    body: [getRandomPosition()],
    direction: { x: 1, y: 0 },
    directionIndex: 0, // Startet nach rechts
    score: 0,
    color: "#" + Math.floor(Math.random() * 16777215).toString(16),
  };

  socket.emit("init", { players, food });
  io.emit("gameUpdate", { players, food });

  if (Object.keys(players).length === 1) moveSnakes();

  socket.on("keyPress", (key) => {
    const player = players[socket.id];
    if (!player) return;

    if (key === "ArrowLeft") {
      player.directionIndex = (player.directionIndex + 3) % 4;
    } else if (key === "ArrowRight") {
      player.directionIndex = (player.directionIndex + 1) % 4;
    }

    player.direction = DIRECTIONS[player.directionIndex];
  });

  socket.on("disconnect", () => {
    console.log("Spieler getrennt:", socket.id);
    delete players[socket.id];
    io.emit("gameUpdate", { players, food });
  });
});

server.listen(port, () => {
  console.log(`Server läuft auf http://localhost:${port}`);
});
