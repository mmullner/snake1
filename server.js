const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Enable CORS for the backend to accept requests from the frontend
app.use(cors({
  origin: "*",  // Allow requests from any domain (you can specify a particular domain if needed)
  methods: ["GET", "POST"]
}));

// Simple static file serving (optional, if you want to serve frontend from here)
app.use(express.static('public'));

// Game state
let gameState = {
  players: {},
  food: { x: 0, y: 0 },
  width: 500,
  height: 500,
};

// Function to spawn food at random positions
function spawnFood() {
  gameState.food = {
    x: Math.floor(Math.random() * (gameState.width / 10)) * 10,
    y: Math.floor(Math.random() * (gameState.height / 10)) * 10,
  };
}

// Game loop logic to update the state
function gameLoop() {
  for (const socketId in gameState.players) {
    const player = gameState.players[socketId];

    // Move the player's snake in the direction
    const head = { ...player.snake[0] };
    if (player.direction === 'UP') head.y -= 10;
    if (player.direction === 'DOWN') head.y += 10;
    if (player.direction === 'LEFT') head.x -= 10;
    if (player.direction === 'RIGHT') head.x += 10;

    player.snake.unshift(head); // Add new head to the snake

    // Check for food collision
    if (head.x === gameState.food.x && head.y === gameState.food.y) {
      player.score += 10;
      spawnFood();  // Spawn new food after eating
    } else {
      player.snake.pop(); // Remove the tail if no food eaten
    }

    // Check if snake hits itself or the wall
    if (head.x < 0 || head.x >= gameState.width || head.y < 0 || head.y >= gameState.height || player.snake.slice(1).some(segment => segment.x === head.x && segment.y === head.y)) {
      // Reset game state if player collides with wall or itself
      gameState.players[socketId] = {
        snake: [{ x: gameState.width / 4, y: gameState.height / 2 }],
        direction: 'RIGHT',
        score: 0
      };
    }
  }
}

// Broadcast game state to all players
function updateClients() {
  io.emit('gameState', gameState);
}

// Set game loop interval (100ms)
setInterval(() => {
  gameLoop();
  updateClients();
}, 100);

// Handle new player connection
io.on('connection', (socket) => {
  console.log('A player connected:', socket.id);

  // Initialize new player state
  gameState.players[socket.id] = {
    snake: [{ x: gameState.width / 4, y: gameState.height / 2 }],
    direction: 'RIGHT',
    score: 0
  };

  // Send the initial game state to the player
  socket.emit('gameState', gameState);

  // Listen for player direction input
  socket.on('changeDirection', (direction) => {
    const player = gameState.players[socket.id];
    if ((player.direction === 'UP' && direction !== 'DOWN') ||
        (player.direction === 'DOWN' && direction !== 'UP') ||
        (player.direction === 'LEFT' && direction !== 'RIGHT') ||
        (player.direction === 'RIGHT' && direction !== 'LEFT')) {
      player.direction = direction;
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    delete gameState.players[socket.id];  // Remove player from game state
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
