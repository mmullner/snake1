const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

// CORS-Konfiguration
const io = socketIo(server, {
  cors: {
    origin: "https://snake-frontend-x8cf.onrender.com",  // Frontend-URL
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
    credentials: true,
  }
});

const port = process.env.PORT || 3000;

app.use(cors());

// Middleware für statische Dateien (Frontend)
app.use(express.static("public"));

let players = {};  // Spieler speichern
let food = { x: 10, y: 10 }; // Initiale Position des Foods

// Funktion zum Spawnen von Food
function spawnFood() {
  food.x = Math.floor(Math.random() * 20);
  food.y = Math.floor(Math.random() * 20);
}

// Funktion, um eine zufällige Position zu generieren, die nicht von einem anderen Spieler besetzt ist
function getRandomFreePosition() {
  let position;
  let isPositionOccupied = true;

  while (isPositionOccupied) {
    position = [Math.floor(Math.random() * 20), Math.floor(Math.random() * 20)];

    // Überprüfen, ob diese Position bereits von einer Schlange besetzt ist
    isPositionOccupied = Object.values(players).some(player =>
      player.body.some(segment => segment[0] === position[0] && segment[1] === position[1])
    );
  }

  return position;
}

// Funktion zum Erzeugen einer zufälligen Farbe
function getRandomColor() {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}

// Funktion für das Bewegen der Schlangen
function moveSnakes() {
  for (const playerId in players) {
    const player = players[playerId];

    // Schlange des Spielers bewegen
    player.body.unshift([player.body[0][0] + player.direction.x, player.body[0][1] + player.direction.y]);
    player.body.pop(); // Entferne das hintere Segment

    // Wandkollision überprüfen (gehe zur gegenüberliegenden Seite)
    if (player.body[0][0] < 0) {
      player.body[0][0] = 19; // Bei Wand auf der linken Seite, gehe auf die rechte Seite
    } else if (player.body[0][0] >= 20) {
      player.body[0][0] = 0; // Bei Wand auf der rechten Seite, gehe auf die linke Seite
    }

    if (player.body[0][1] < 0) {
      player.body[0][1] = 19; // Bei Wand oben, gehe nach unten
    } else if (player.body[0][1] >= 20) {
      player.body[0][1] = 0; // Bei Wand unten, gehe nach oben
    }

    // Überprüfe, ob die Schlange mit sich selbst kollidiert
    if (player.body.slice(1).some(segment => segment[0] === player.body[0][0] && segment[1] === player.body[0][1])) {
      // Wenn die Schlange mit sich selbst kollidiert oder stirbt, spawn den Spieler neu
      console.log(`${playerId} hat verloren! Neuer Spawn...`);
      // Setze die Schlange an eine neue Position mit einer Mindestlänge von 3
      player.body = [
        getRandomFreePosition(),
        getRandomFreePosition(),
        getRandomFreePosition(),
      ]; // Startposition neu setzen
      player.direction = { x: 1, y: 0 }; // Anfangsrichtung setzen
      player.score = 0; // Score zurücksetzen
    }

    // Überprüfe, ob die Schlange das Food isst
    if (player.body[0][0] === food.x && player.body[0][1] === food.y) {
      player.body.push([...player.body[player.body.length - 1]]);
      player.score += 10;
      spawnFood(); // Neues Food spawnen
    }
  }

  // Broadcast den Spielstatus an alle Spieler
  io.emit("gameUpdate", { players, food });

  // Wiederhole die Bewegung alle 200ms
  setTimeout(moveSnakes, 200);
}

// Spieler initialisieren, wenn sie sich verbinden
io.on("connection", (socket) => {
  console.log("Ein Spieler hat sich verbunden:", socket.id);

  // Schlange für den neuen Spieler initialisieren
  let snake = {
    id: socket.id,
    direction: { x: 1, y: 0 },
    body: [[10, 10], [10, 9], [10, 8]], // Anfangsposition der Schlange
    score: 0,
    color: getRandomColor()  // Zufällige Farbe für jeden Spieler
  };

  players[socket.id] = snake;

  // Sende den initialen Spielstatus an den neuen Spieler
  socket.emit("init", { snake, food });

  // Broadcast an andere Spieler, dass ein neuer Spieler eingetreten ist
  socket.broadcast.emit("newPlayer", { id: socket.id, snake });

  // Wenn der erste Spieler sich verbindet, starte das Spiel
  if (Object.keys(players).length === 1) {
    moveSnakes(); // Start der Spielschleife
  }

  // Tastenanschläge für Steuerung empfangen
  socket.on("keyPress", (key) => {
    const player = players[socket.id];

    if (key === "ArrowUp" && player.direction.y !== 1) player.direction = { x: 0, y: -1 };
    if (key === "ArrowDown" && player.direction.y !== -1) player.direction = { x: 0, y: 1 };
    if (key === "ArrowLeft" && player.direction.x !== 1) player.direction = { x: -1, y: 0 };
    if (key === "ArrowRight" && player.direction.x !== -1) player.direction = { x: 1, y: 0 };
  });

  // Wenn ein Spieler sich trennt
  socket.on("disconnect", () => {
    console.log("Ein Spieler hat sich getrennt:", socket.id);
    delete players[socket.id]; // Spieler aus dem Spielstatus entfernen
    socket.broadcast.emit("playerLeft", { id: socket.id });
  });
});

// Server starten
server.listen(port, () => {
  console.log(`Server läuft auf http://localhost:${port}`);
});
