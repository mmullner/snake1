// Setup the game canvas
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Socket.IO connection
const socket = io('https://snake1-kgp4.onrender.com');  // Replace with your backend URL

// Snake Game Variables
let snake = [{ x: canvas.width / 2, y: canvas.height / 2 }];
let food = {};
let direction = 'RIGHT';
let score = 0;

// Listen for keyboard events to control the snake
document.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowUp' && direction !== 'DOWN') direction = 'UP';
  if (event.key === 'ArrowDown' && direction !== 'UP') direction = 'DOWN';
  if (event.key === 'ArrowLeft' && direction !== 'RIGHT') direction = 'LEFT';
  if (event.key === 'ArrowRight' && direction !== 'LEFT') direction = 'RIGHT';
});

// Main game loop
function gameLoop() {
  updateGame();
  drawGame();
}

// Update the game state
function updateGame() {
  // Move the snake
  const head = { ...snake[0] };
  if (direction === 'UP') head.y -= 10;
  if (direction === 'DOWN') head.y += 10;
  if (direction === 'LEFT') head.x -= 10;
  if (direction === 'RIGHT') head.x += 10;

  // Collision with walls (if snake goes out of bounds)
  if (head.x < 0 || head.x >= canvas.width || head.y < 0 || head.y >= canvas.height) {
    resetGame();
  }

  // Collision with itself
  if (snake.some((segment) => segment.x === head.x && segment.y === head.y)) {
    resetGame();
  }

  // Add new head to snake
  snake.unshift(head);

  // Check for food collision
  if (head.x === food.x && head.y === food.y) {
    score += 10;
    spawnFood();
  } else {
    snake.pop(); // Remove the tail if no food eaten
  }
}

// Draw the game state
function drawGame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw snake
  snake.forEach((segment, index) => {
    ctx.fillStyle = index === 0 ? 'green' : 'lime';
    ctx.fillRect(segment.x, segment.y, 10, 10);
  });

  // Draw food
  ctx.fillStyle = 'red';
  ctx.fillRect(food.x, food.y, 10, 10);

  // Draw score
  ctx.fillStyle = 'white';
  ctx.font = '20px Arial';
  ctx.fillText(`Score: ${score}`, 10, 30);
}

// Spawn food at random position
function spawnFood() {
  food = {
    x: Math.floor(Math.random() * (canvas.width / 10)) * 10,
    y: Math.floor(Math.random() * (canvas.height / 10)) * 10,
  };
}

// Reset the game
function resetGame() {
  snake = [{ x: canvas.width / 2, y: canvas.height / 2 }];
  direction = 'RIGHT';
  score = 0;
  spawnFood();
}

// Call gameLoop every 100ms
setInterval(gameLoop, 100);
