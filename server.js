const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");

// MongoDB Chat Schema
const chatSchema = new mongoose.Schema({
    room: String,
    messages: [
        {
            sender: String,
            text: String,
            timestamp: String,
        },
    ],
});
const Chat = mongoose.model("Chat", chatSchema);

// Initialize Express and MongoDB
const app = express();
const server = http.createServer(app);
const io = new Server(server);
mongoose.connect("mongodb://127.0.0.1:27017/socketio-chat", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => console.log("MongoDB connected"));

// Rate Limiting Middleware
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
});
app.use(limiter);

// Serve Static Files
app.use(express.static("public"));

// Token Validation Middleware
const validTokens = ["secure_token_1", "secure_token_2"]; // Simulated token database
io.use((socket, next) => {
    const { token, username } = socket.handshake.auth;
    if (validTokens.includes(token) && username) {
        socket.username = username;
        next();
    } else {
        next(new Error("Unauthorized"));
    }
});

// Handle WebSocket Connections
io.on("connection", async (socket) => {
    console.log(`${socket.username} connected`);

    // Join a specific room
    socket.on("joinRoom", async (room) => {
        socket.join(room);
        console.log(`${socket.username} joined room: ${room}`);

        // Load previous chat history
        const chat = await Chat.findOne({ room });
        if (chat) {
            socket.emit("loadMessages", chat.messages);
        }

        // Notify other users in the room
        socket.to(room).emit("message", {
            text: `${socket.username} has joined the room.`,
            sender: "System",
            timestamp: new Date().toLocaleTimeString(),
        });
    });

    // Handle incoming messages
    socket.on("message", async (data) => {
        const { room, text } = data;
        const timestamp = new Date().toLocaleTimeString();

        // Save message to database
        let chat = await Chat.findOne({ room });
        if (!chat) {
            chat = new Chat({ room, messages: [] });
        }
        chat.messages.push({ sender: socket.username, text, timestamp });
        await chat.save();

        // Broadcast message to the room
        io.to(room).emit("message", { sender: socket.username, text, timestamp });
    });

    // Typing indicators
    socket.on("typing", (room) => {
        socket.to(room).emit("typing", `${socket.username} is typing...`);
    });

    // Stop typing indicators
    socket.on("stopTyping", (room) => {
        socket.to(room).emit("stopTyping");
    });

    // Handle disconnection
    socket.on("disconnect", () => {
        console.log(`${socket.username} disconnected`);
    });
});

// Start Server
server.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});
