const express = require("express");
const http = require("http");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

// CORS-Konfiguration
const io = require("socket.io")(server, {
  cors: {
    origin: "https://snake-frontend-x8cf.onrender.com", // Frontend-URL
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
    credentials: true,
  },
});

const port = process.env.PORT || 3000;

app.use(cors());

// Middleware für statische Dateien (Frontend)
app.use(express.static("public"));

let players = {}; // Spieler speichern
let food = { x: 10, y: 10 }; // Initiale Position des Foods
let usedPlayerNumbers = new Set(); // Vergebene Spielernummern speichern

// Funktion zum Spawnen von Food
function spawnFood() {
  food.x = Math.floor(Math.random() * 20);
  food.y = Math.floor(Math.random() * 20);
}

// Funktion zum Generieren einer zufälligen Farbe
function getRandomColor() {
  const letters = "0123456789ABCDEF";
  let color = "#";
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}

// Funktion, um die kleinste nicht vergebene Spielernummer zu finden
function getNextAvailablePlayerNumber() {
  let num = 1;
  while (usedPlayerNumbers.has(num)) {
    num++;
  }
  usedPlayerNumbers.add(num); // Reserviere die Nummer
  return num;
}

// Funktion zum Freigeben einer Spielernummer (bei Disconnect)
function releasePlayerNumber(num) {
  usedPlayerNumbers.delete(num);
}

// Funktion zum Zurücksetzen eines Spielers
function resetPlayer(id) {
  const playerNumber = getNextAvailablePlayerNumber();
  const playerName = `Player${playerNumber}`;

  const newSnake = {
    id: id,
    direction: { x: 1, y: 0 },
    body: [[Math.floor(Math.random() * 20), Math.floor(Math.random() * 20)]], // Zufällige Startposition
    score: 0,
    color: getRandomColor(),
    name: playerName,
    playerNumber: playerNumber,
  };

  players[id] = newSnake;
  return newSnake;
}

// Spieler initialisieren, wenn sie sich verbinden
io.on("connection", (socket) => {
  console.log("Ein Spieler hat sich verbunden:", socket.id);

  // Kleinste freie Spielernummer suchen
  const playerNumber = getNextAvailablePlayerNumber();
  const playerName = `Player${playerNumber}`;

  // Schlange für den neuen Spieler initialisieren
  let snake = {
    id: socket.id,
    direction: { x: 1, y: 0 },
    body: [[Math.floor(Math.random() * 20), Math.floor(Math.random() * 20)]], // Zufällige Position
    score: 0,
    color: getRandomColor(),
    name: playerName,
    playerNumber: playerNumber,
  };

  // Neuen Spieler speichern
  players[socket.id] = snake;

  // Sende den initialen Spielstatus an den neuen Spieler
  socket.emit("init", { snake, food });

  // Broadcast an andere Spieler, dass ein neuer Spieler eingetreten ist
  socket.broadcast.emit("newPlayer", { id: socket.id, snake });

  //Steuerung
  socket.on("keyPress", (key) => {
    const player = players[socket.id];
    if (!player) return;

    const currentDirection = player.direction;

    // Wenn der Spieler nach links drehen möchte
    if (key === "ArrowLeft") {
        if (currentDirection.x === 1) {
            player.direction = { x: 0, y: -1 }; // Rechts → Oben
        } else if (currentDirection.x === -1) {
            player.direction = { x: 0, y: 1 }; // Links → Unten
        } else if (currentDirection.y === 1) {
            player.direction = { x: 1, y: 0 }; // Unten → Rechts
        } else if (currentDirection.y === -1) {
            player.direction = { x: -1, y: 0 }; // Oben → Links
        }
    }

    // Wenn der Spieler nach rechts drehen möchte
    if (key === "ArrowRight") {
        if (currentDirection.x === 1) {
            player.direction = { x: 0, y: 1 }; // Rechts → Unten
        } else if (currentDirection.x === -1) {
            player.direction = { x: 0, y: -1 }; // Links → Oben
        } else if (currentDirection.y === 1) {
            player.direction = { x: -1, y: 0 }; // Unten → Links
        } else if (currentDirection.y === -1) {
            player.direction = { x: 1, y: 0 }; // Oben → Rechts
        }
    }
});


  // Wenn ein Spieler sich trennt
  socket.on("disconnect", () => {
    console.log(`Spieler ${playerName} hat sich getrennt:`, socket.id);
    releasePlayerNumber(players[socket.id].playerNumber); // Spielernummer wieder freigeben
    delete players[socket.id]; // Spieler entfernen
    socket.broadcast.emit("playerLeft", { id: socket.id });
  });
});

// Funktion für die Spielschleife, die für alle Spieler zuständig ist
const moveSnakes = () => {
  for (const playerId in players) {
    const player = players[playerId];

    // Schlange des Spielers bewegen
    player.body.unshift([player.body[0][0] + player.direction.x, player.body[0][1] + player.direction.y]);
    player.body.pop(); // Entferne das hintere Segment

    // Wandkollision überprüfen und den Spieler auf der gegenüberliegenden Seite erscheinen lassen
    if (player.body[0][0] < 0) {
      player.body[0][0] = 19;
    } else if (player.body[0][0] >= 20) {
      player.body[0][0] = 0;
    }

    if (player.body[0][1] < 0) {
      player.body[0][1] = 19;
    } else if (player.body[0][1] >= 20) {
      player.body[0][1] = 0;
    }

    // Überprüfe, ob die Schlange mit sich selbst kollidiert
    if (player.body.slice(1).some(segment => segment[0] === player.body[0][0] && segment[1] === player.body[0][1])) {
      console.log(`Spieler ${player.id} hat sich selbst kollidiert und startet neu.`);
      const newSnake = resetPlayer(player.id);
      io.to(player.id).emit("gameReset", { snake: newSnake, food });
    }

    // Überprüfe, ob die Schlange das Food isst
    if (player.body[0][0] === food.x && player.body[0][1] === food.y) {
      player.body.push([...player.body[player.body.length - 1]]);
      player.score += 10;
      spawnFood();
    }

    // Überprüfe Kollisionen mit anderen Spielern
    for (const otherPlayerId in players) {
      if (otherPlayerId !== playerId) {
        const otherPlayer = players[otherPlayerId];
        if (otherPlayer.body.some(segment => segment[0] === player.body[0][0] && segment[1] === player.body[0][1])) {
          console.log(`Spieler ${player.id} hat mit Spieler ${otherPlayerId} kollidiert und startet neu.`);
          const newSnake = resetPlayer(player.id);
          io.to(player.id).emit("gameReset", { snake: newSnake, food });
        }
      }
    }
  }

  // Broadcast den Spielstatus an alle Spieler
  io.emit("gameUpdate", { players, food });

  // Wiederhole die Bewegung alle 200ms
  setTimeout(moveSnakes, 200);
};

// Spiel starten
moveSnakes();

// Server starten
server.listen(port, () => {
  console.log(`Server läuft auf http://localhost:${port}`);
});
