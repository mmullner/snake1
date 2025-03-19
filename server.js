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

// Variable, die angibt, ob die Spielschleife bereits läuft
let gameStarted = false;

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
  } while (
    Object.values(players).some(player =>
      player.body.some(segment => segment[0] === position[0] && segment[1] === position[1])
    )
  );
  return position;
}

// Zufällige Farbe generieren
function getRandomColor() {
  return `#${Math.floor(Math.random() * 16777215).toString(16)}`;
}

// Bewegungsschleife – wird nur einmal gestartet
function moveSnakes() {
  for (const playerId in players) {
    const player = players[playerId];

    const newHead = [
      (player.body[0][0] + player.direction.x + gridSize) % gridSize,
      (player.body[0][1] + player.direction.y + gridSize) % gridSize
    ];

    player.body.unshift(newHead);

    // Kollision mit sich selbst
    if (player.body.slice(1).some(segment => segment[0] === newHead[0] && segment[1] === newHead[1])) {
      console.log(`Spieler ${player.number} ist gestorben! Respawn...`);
      player.body = [getRandomFreePosition(), [0, 0], [0, 0]]; // Setze Spieler neu – hier kannst du die Startlänge anpassen
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
  setTimeout(moveSnakes, 100); // Geschwindigkeit: alle 100ms
}

io.on("connection", (socket) => {
  console.log(`Spieler verbunden: ${socket.id}`);

  // Beim Refresh (Verbindung neu) wird der alte Spieler automatisch entfernt,
  // da disconnect ausgelöst wird. Wir müssen hier nichts weiter tun.

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

  // Starte die Spielschleife nur, wenn sie noch nicht läuft
  if (!gameStarted) {
    gameStarted = true;
    moveSnakes();
  }

  socket.on("keyPress", (key) => {
    const player = players[socket.id];
    if (!player) return;

    // PC-Tastatursteuerung: Linksdrehung und Rechtsdrehung
    if (key === "ArrowLeft" || key === "KeyA") {
      // Links drehen (gegen den Uhrzeigersinn)
      const temp = player.direction.x;
      player.direction.x = player.direction.y;
      player.direction.y = -temp;
    }
    if (key === "ArrowRight" || key === "KeyD") {
      // Rechts drehen (im Uhrzeigersinn)
      const temp = player.direction.x;
      player.direction.x = -player.direction.y;
      player.direction.y = temp;
    }
  });

  socket.on("disconnect", () => {
    console.log(`Spieler ${socket.id} hat das Spiel verlassen`);
    delete players[socket.id];
    io.emit("playerLeft", { id: socket.id });
    io.emit("gameUpdate", { players, food });
    // Wenn keine Spieler mehr verbunden sind, setze gameStarted zurück
    if (Object.keys(players).length === 0) {
      gameStarted = false;
    }
  });
});

server.listen(port, () => {
  console.log(`Server läuft auf http://localhost:${port}`);
});
