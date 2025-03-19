const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Enable CORS for the backend
app.use(cors({
  origin: "*",  // Allow requests from any domain (you can specify a particular domain here if needed)
  methods: ["GET", "POST"]
}));

// Serve static files (optional, if you want to serve the frontend from the same backend)
app.use(express.static('public'));

// Example of a simple route
app.get('/', (req, res) => {
  res.send('Welcome to the Snake Game Backend');
});

// Handle Socket.IO connection
io.on('connection', (socket) => {
  console.log('A user connected');

  // You can add custom events for game logic here
  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
