const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: "https://snake-frontend-x8cf.onrender.com", // Deine Frontend-URL
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
let playerCount = 0;

function spawnFood() {
  food.x = Math.floor(Math.random() * 20);
  food.y = Math.floor(Math.random() * 20);
}

function getRandomFreePosition() {
  let position;
  let occupied = true;

  while (occupied) {
    position = [Math.floor(Math.random() * 20), Math.floor(Math.random() * 20)];
    occupied = Object.values(players).some(player =>
      player.body.some(segment => segment[0] === position[0] && segment[1] === position[1])
    );
  }

  return position;
}

function getRandomColor() {
  return "#" + Math.floor(Math.random() * 16777215).toString(16);
}

function moveSnakes() {
  for (const playerId in players) {
    const player = players[playerId];

    player.body.unshift([player.body[0][0] + player.direction.x, player.body[0][1] + player.direction.y]);
    player.body.pop();

    if (player.body[0][0] < 0) player.body[0][0] = 19;
    if (player.body[0][0] >= 20) player.body[0][0] = 0;
    if (player.body[0][1] < 0) player.body[0][1] = 19;
    if (player.body[0][1] >= 20) player.body[0][1] = 0;

    if (player.body.slice(1).some(segment => segment[0] === player.body[0][0] && segment[1] === player.body[0][1])) {
      console.log(`${player.name} ist gestorben! Respawn...`);
      player.body = [getRandomFreePosition()];
      player.direction = { x: 1, y: 0 };
      player.score = 0;
    }

    if (player.body[0][0] === food.x && player.body[0][1] === food.y) {
      player.body.push([...player.body[player.body.length - 1]]);
      player.score += 10;
      spawnFood();
    }
  }

  io.emit("gameUpdate", { players, food });
  setTimeout(moveSnakes, 200);
}

io.on("connection", (socket) => {
  console.log("Spieler verbunden:", socket.id);
  playerCount++;

  let snake = {
    id: socket.id,
    name: `Spieler ${playerCount}`,
    direction: { x: 1, y: 0 },
    body: [getRandomFreePosition()],
    score: 0,
    color: getRandomColor(),
  };

  players[socket.id] = snake;

  socket.emit("init", { snake, food });
  io.emit("gameUpdate", { players, food });

  if (Object.keys(players).length === 1) moveSnakes();

  socket.on("keyPress", (key) => {
    const player = players[socket.id];
    if (!player) return;

    if (key === "ArrowUp" && player.direction.y !== 1) player.direction = { x: 0, y: -1 };
    if (key === "ArrowDown" && player.direction.y !== -1) player.direction = { x: 0, y: 1 };
    if (key === "ArrowLeft" && player.direction.x !== 1) player.direction = { x: -1, y: 0 };
    if (key === "ArrowRight" && player.direction.x !== -1) player.direction = { x: 1, y: 0 };
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
