// server.js
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const port = 3000;

// Middleware für statische Dateien (Frontend)
app.use(express.static("public"));

let players = [];

io.on("connection", (socket) => {
    console.log("a player connected");

    // Neuen Spieler registrieren
    players.push(socket.id);

    // Startpunkt für die Schlangen
    let snake = {
        id: socket.id,
        direction: { x: 1, y: 0 },
        body: [[10, 10], [10, 9], [10, 8]], // Anfangsposition
        score: 0,
    };

    // Sende die Schlange an den verbundenen Spieler
    socket.emit("init", { snake });

    // Broadcast an andere Spieler, dass ein neuer Spieler eingetreten ist
    socket.broadcast.emit("newPlayer", { id: socket.id, snake });

    // Bewege die Schlangen und sende regelmäßig Updates
    const moveSnake = () => {
        // Schlange bewegen
        snake.body.unshift([snake.body[0][0] + snake.direction.x, snake.body[0][1] + snake.direction.y]);
        snake.body.pop(); // Entferne das hintere Segment der Schlange

        // Kollision mit der Wand überprüfen
        if (snake.body[0][0] < 0 || snake.body[0][0] >= 20 || snake.body[0][1] < 0 || snake.body[0][1] >= 20) {
            io.emit("gameOver", { winner: socket.id === players[0] ? "Blue" : "Red", scores: players });
            players = [];
            return;
        }

        // Broadcast an alle Spieler (Position der Schlangen)
        io.emit("gameUpdate", { snake });

        // Wiederhole die Bewegung der Schlange alle 200ms
        setTimeout(moveSnake, 200);
    };

    // Spiel starten
    moveSnake();

    // Tastenanschläge für Steuerung empfangen
    socket.on("keyPress", (key) => {
        if (key === "ArrowUp" && snake.direction.y !== 1) snake.direction = { x: 0, y: -1 };
        if (key === "ArrowDown" && snake.direction.y !== -1) snake.direction = { x: 0, y: 1 };
        if (key === "ArrowLeft" && snake.direction.x !== 1) snake.direction = { x: -1, y: 0 };
        if (key === "ArrowRight" && snake.direction.x !== -1) snake.direction = { x: 1, y: 0 };
    });

    socket.on("disconnect", () => {
        console.log("a player disconnected");
        players = players.filter(player => player !== socket.id);
        socket.broadcast.emit("playerLeft", { id: socket.id });
    });
});

// Starte den Server
server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
