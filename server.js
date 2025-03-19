const express = require("express");
const http = require("http");
const cors = require("cors");  // CORS-Modul einbinden

const app = express();
const server = http.createServer(app);

// CORS-Konfguration
const io = require('socket.io')(server, {
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

// Funktion zum Generieren einer zufälligen Farbe
function getRandomColor() {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
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
    color: getRandomColor(),  // Zufällige Farbe für die Schlange
  };

  // Neuen Spieler zum Spieler-Objekt hinzufügen
  players[socket.id] = snake;

  // Sende den initialen Spielstatus an den neuen Spieler
  socket.emit("init", { snake, food });

  // Broadcast an andere Spieler, dass ein neuer Spieler eingetreten ist
  socket.broadcast.emit("newPlayer", { id: socket.id, snake });

  // Spielschleife für alle Spieler
  const moveSnakes = () => {
    for (const playerId in players) {
      const player = players[playerId];

      // Schlange des Spielers bewegen
      player.body.unshift([player.body[0][0] + player.direction.x, player.body[0][1] + player.direction.y]);
      player.body.pop(); // Entferne das hintere Segment

      // Wandkollision überprüfen und den Spieler auf der gegenüberliegenden Seite erscheinen lassen
      if (player.body[0][0] < 0) {
        player.body[0][0] = 19;  // An der rechten Seite erscheinen
      } else if (player.body[0][0] >= 20) {
        player.body[0][0] = 0;  // An der linken Seite erscheinen
      }

      if (player.body[0][1] < 0) {
        player.body[0][1] = 19;  // Am unteren Rand erscheinen
      } else if (player.body[0][1] >= 20) {
        player.body[0][1] = 0;  // Am oberen Rand erscheinen
      }

      // Überprüfe, ob die Schlange mit sich selbst kollidiert
      if (
        player.body.slice(1).some(segment => segment[0] === player.body[0][0] && segment[1] === player.body[0][1])
      ) {
        io.emit("gameOver", { winner: playerId === Object.keys(players)[0] ? "Blue" : "Red", scores: players });
        players = {}; // Alle Spieler zurücksetzen
        return;
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
  };

  // Spiel starten
  moveSnakes();

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
