const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = 3000;

io.on('connection', (socket) => {
  console.log(`ユーザー接続: ${socket.id}`);

  // 周波数（ルーム）への参加
  socket.on('join-frequency', (frequency) => {
    const roomID = `room_${frequency.replace('.', '')}`;
    
    // 既存の部屋を抜ける
    Array.from(socket.rooms).forEach(room => {
      if (room !== socket.id) {
        socket.leave(room);
        updateRoomCount(room);
      }
    });

    socket.join(roomID);
    socket.currentRoom = roomID;
    updateRoomCount(roomID);
  });

  // 切断処理
  socket.on('disconnect', () => {
    if (socket.currentRoom) {
      updateRoomCount(socket.currentRoom);
    }
  });
});

function updateRoomCount(roomID) {
  const room = io.sockets.adapter.rooms.get(roomID);
  const count = room ? room.size : 0;
  io.to(roomID).emit('room-count-update', count);
}

server.listen(PORT, () => {
  console.log(`サーバーがポート ${PORT} で起動しました。`);
});