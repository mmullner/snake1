const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");  // CORS-Modul einbinden

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// CORS-Konfiguration
const corsOptions = {
	origin: 'https://snake-frontend-x8cf.onrender.com',  // Frontend-URL, die auf das Backend zugreifen darf
	methods: ['GET', 'POST'],
	allowedHeaders: ['Content-Type', 'Authorization'],  // Falls Header wie Authentifizierung benötigt werden
	credentials: true // Wenn Cookies und Authentifizierung verwendet werden
  };

app.use(cors(corsOptions)); // CORS Middleware

const port = 3000;

// Middleware für statische Dateien (Frontend)
app.use(express.static("public"));

let players = {};  // Store players by socket id
let food = { x: 10, y: 10 }; // Initial food position

// Funktion zum Spawnen von Food
function spawnFood() {
  food.x = Math.floor(Math.random() * 20);
  food.y = Math.floor(Math.random() * 20);
}

// Spieler initialisieren, wenn sie sich verbinden
io.on("connection", (socket) => {
  console.log("Ein Spieler hat sich verbunden:", socket.id);

  // Schlange für den neuen Spieler initialisieren
  let snake = {
    id: socket.id,
    direction: { x: 1, y: 0 },
    body: [[10, 10], [10, 9], [10, 8]], // Anfangsposition
    score: 0,
  };

  players[socket.id] = snake;

  // Sende den initialen Spielstatus an den neuen Spieler
  socket.emit("init", { snake, food });

  // Broadcast an andere Spieler, dass ein neuer Spieler eingetreten ist
  socket.broadcast.emit("newPlayer", { id: socket.id, snake });

  // Spielschleife, um die Schlangen zu bewegen und den Spielstatus regelmäßig zu aktualisieren
  const moveSnakes = () => {
    for (const playerId in players) {
      const player = players[playerId];

      // Schlange des Spielers bewegen
      player.body.unshift([player.body[0][0] + player.direction.x, player.body[0][1] + player.direction.y]);
      player.body.pop(); // Entferne das hintere Segment

      // Wandkollision überprüfen
      if (
        player.body[0][0] < 0 || player.body[0][0] >= 20 ||
        player.body[0][1] < 0 || player.body[0][1] >= 20 ||
        // Überprüfe, ob die Schlange mit sich selbst kollidiert
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
