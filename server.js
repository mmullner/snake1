const express = require("express");
const http = require("http");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

// CORS-Konfiguration
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
let playerCounter = 1;  // Zähler für die niedrigste freie Spielernummer
const gridSize = 20; // Spielfeldgröße (20x20)

// Funktion zum Spawnen von Food
function spawnFood() {
  food.x = Math.floor(Math.random() * gridSize);
  food.y = Math.floor(Math.random() * gridSize);
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

// Funktion, um eine zufällige, nicht belegte Position zu finden
function getRandomAvailablePosition() {
  let position;
  let isOccupied = true;

  while (isOccupied) {
    position = [Math.floor(Math.random() * gridSize), Math.floor(Math.random() * gridSize)];

    // Überprüfen, ob diese Position von anderen Spielern oder Food belegt ist
    isOccupied = Object.values(players).some(player => player.body.some(segment => segment[0] === position[0] && segment[1] === position[1]));
    isOccupied = isOccupied || (food.x === position[0] && food.y === position[1]);
  }

  return position;
}

// Funktion, um die Kollision zwischen zwei Spielern zu prüfen
function checkCollisionBetweenPlayers(player1, player2) {
  return player1.body.some(segment =>
    segment[0] === player2.body[0][0] && segment[1] === player2.body[0][1]
  );
}

// Spieler initialisieren, wenn sie sich verbinden
io.on("connection", (socket) => {
  console.log("Ein Spieler hat sich verbunden:", socket.id);

  // Spielername mit niedrigster noch nicht vergebenen Nummer
  const playerName = `Player${playerCounter}`;
  playerCounter++;  // Erhöhe den Zähler für die nächste Nummer

  // Schlange für den neuen Spieler initialisieren
  const initialPosition = getRandomAvailablePosition(); // Zufällige Startposition
  let snake = {
    id: socket.id,
    direction: { x: 1, y: 0 },
    body: [initialPosition, [initialPosition[0], initialPosition[1] - 1], [initialPosition[0], initialPosition[1] - 2]], // Anfangsposition der Schlange
    score: 0,
    color: getRandomColor(),  // Zufällige Farbe für die Schlange
    name: playerName,  // Spielername setzen
  };

  // Neuen Spieler zum Spieler-Objekt hinzufügen
  players[socket.id] = snake;

  // Sende den initialen Spielstatus an den neuen Spieler
  socket.emit("init", { snake, food, playerName });

  // Broadcast an andere Spieler, dass ein neuer Spieler eingetreten ist
  socket.broadcast.emit("newPlayer", { id: socket.id, snake });

  // Tastenanschläge für Steuerung empfangen
  socket.on("keyPress", (key) => {
    const player = players[socket.id];

    // Nur nach links und rechts drehen
    if (key === "ArrowLeft" && player.direction.x !== 1) {
      player.direction = { x: -1, y: 0 }; // Nach links drehen
    }
    if (key === "ArrowRight" && player.direction.x !== -1) {
      player.direction = { x: 1, y: 0 }; // Nach rechts drehen
    }
  });

  // Wenn ein Spieler sich trennt
  socket.on("disconnect", () => {
    console.log("Ein Spieler hat sich getrennt:", socket.id);
    delete players[socket.id]; // Spieler aus dem Spielstatus entfernen
    socket.broadcast.emit("playerLeft", { id: socket.id });
  });
});

// Funktion zum Zurücksetzen des Spielers
function resetPlayer(socketId) {
  const initialPosition = getRandomAvailablePosition(); // Zufällige Startposition
  let snake = {
    id: socketId,
    direction: { x: 1, y: 0 },
    body: [initialPosition, [initialPosition[0], initialPosition[1] - 1], [initialPosition[0], initialPosition[1] - 2]], // Anfangsposition der Schlange
    score: 0,
    color: getRandomColor(),  // Zufällige Farbe für die Schlange
    name: players[socketId].name,
  };

  players[socketId] = snake;
  return snake;
}

// Funktion für die Spielschleife, die für alle Spieler zuständig ist
const moveSnakes = () => {
  for (const playerId in players) {
    const player = players[playerId];

    // Schlange des Spielers bewegen
    player.body.unshift([player.body[0][0] + player.direction.x, player.body[0][1] + player.direction.y]);
    player.body.pop(); // Entferne das hintere Segment

    // Wandkollision überprüfen und den Spieler auf der gegenüberliegenden Seite erscheinen lassen
    if (player.body[0][0] < 0) {
      player.body[0][0] = gridSize - 1;  // An der rechten Seite erscheinen
    } else if (player.body[0][0] >= gridSize) {
      player.body[0][0] = 0;  // An der linken Seite erscheinen
    }

    if (player.body[0][1] < 0) {
      player.body[0][1] = gridSize - 1;  // Am unteren Rand erscheinen
    } else if (player.body[0][1] >= gridSize) {
      player.body[0][1] = 0;  // Am oberen Rand erscheinen
    }

    // Überprüfe, ob die Schlange mit sich selbst kollidiert
    if (
      player.body.slice(1).some(segment => segment[0] === player.body[0][0] && segment[1] === player.body[0][1])
    ) {
      console.log(`Spieler ${player.id} hat sich selbst kollidiert und startet neu.`);
      // Spieler zurücksetzen
      const newSnake = resetPlayer(player.id);
      io.to(player.id).emit("gameReset", { snake: newSnake, food });  // Sende die Spiel-Reset-Nachricht
    }

    // Überprüfe Kollision zwischen Spielern
    for (const otherPlayerId in players) {
      if (playerId !== otherPlayerId && checkCollisionBetweenPlayers(player, players[otherPlayerId])) {
        console.log(`Spieler ${player.id} hat mit Spieler ${otherPlayerId} kollidiert und startet neu.`);
        // Beide Spieler zurücksetzen
        const newSnake = resetPlayer(player.id);
        io.to(player.id).emit("gameReset", { snake: newSnake, food });

        const otherNewSnake = resetPlayer(otherPlayerId);
        io.to(otherPlayerId).emit("gameReset", { snake: otherNewSnake, food });
      }
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

// Server starten
server.listen(port, () => {
  console.log(`Server läuft auf http://localhost:${port}`);
});
