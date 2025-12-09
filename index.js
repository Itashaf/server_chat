// server/index.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Chat server is running ✅");
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    // origin: 'http://localhost:5173', 
    origin: 'https://elred-chat.vercel.app', 
    methods: ["GET", "POST"],
  },
});

// username -> socketId
const users = {};

// roomName -> Set<username> (kis room me kaun-kaun hai)
const roomMembers = {};

// All open groups (anyone can click & join). Global Chat by default.
const groups = new Set(["Global Chat"]);

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // New client ko current groups bhej do
  socket.emit("groups_list", Array.from(groups));

  // ---------- REGISTER USER ----------
  socket.on("register_user", (username) => {
    if (!username) return;

    users[username] = socket.id;
    socket.data.username = username; // socket ke saath username attach

    console.log(`User registered: ${username} (${socket.id})`);

    io.emit("online_users", Object.keys(users));
  });

  // ---------- JOIN ROOM ----------
  socket.on("join_room", (roomName) => {
    if (!roomName) return;

    console.log(`Socket ${socket.id} joined room: ${roomName}`);
    socket.join(roomName);

    const user = socket.data.username;
    if (user) {
      if (!roomMembers[roomName]) {
        roomMembers[roomName] = new Set();
      }
      roomMembers[roomName].add(user);
    }
  });

  // ---------- CREATE GROUP (OPEN) ----------
  socket.on("create_group", (groupName) => {
    if (!groupName) return;

    groups.add(groupName);
    console.log("Group created:", groupName);

    // sabko updated groups bhej do
    io.emit("groups_list", Array.from(groups));
  });

  // ---------- SEND MESSAGE ----------
  socket.on("send_message", (data) => {
    const { room, author, message } = data || {};
    if (!room || !author || !message) return;

    // 1) Normal: jo room me joined hain unko bhejo
    io.to(room).emit("receive_message", data);

    // 2) PRIVATE ROOM FIX:
    // agar room private type hai ("A_B") to ensure saamne wale ko bhi mile
    if (room.includes("_")) {
      const [u1, u2] = room.split("_");
      const otherUser = author === u1 ? u2 : u1;

      const otherSocketId = users[otherUser];

      // check karo ki other user already room me hai ya nahi
      const members = roomMembers[room];
      const otherInRoom = members && members.has(otherUser);

      // agar woh room me nahi hai, to uske socket pe direct emit karo
      if (otherSocketId && !otherInRoom) {
        io.to(otherSocketId).emit("receive_message", data);
      }
    }
  });

  // ---------- TYPING ----------
  socket.on("typing", ({ username, room }) => {
    if (!room || !username) return;
    socket.to(room).emit("typing", { username, room });
  });

  socket.on("stop_typing", (room) => {
    if (!room) return;
    socket.to(room).emit("stop_typing", room);
  });

  // ---------- DISCONNECT ----------
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    const user = socket.data.username;

    if (user) {
      // users map se hatao
      if (users[user] === socket.id) {
        delete users[user];
      }

      // jitne rooms me tha, sab se remove karo
      Object.keys(roomMembers).forEach((roomName) => {
        const set = roomMembers[roomName];
        if (!set) return;
        set.delete(user);
        if (set.size === 0) {
          delete roomMembers[roomName];
        }
      });
    }

    io.emit("online_users", Object.keys(users));
  });
});

server.listen(8080, () => {
  console.log(`Server listening on port:8080`);
});
