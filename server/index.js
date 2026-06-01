const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = 3000;

// アクセスブロック（BAN）用の簡易リスト
const bannedUsers = new Set();

io.on('connection', (socket) => {
  // ブロックされているIPやIDなら即切断
  if (bannedUsers.has(socket.handshake.address) || bannedUsers.has(socket.id)) {
    console.log(`ブロック済みのアクセスを拒否: ${socket.id}`);
    socket.disconnect(true);
    return;
  }

  console.log(`ユーザー接続: ${socket.id}`);

  // 周波数（ルーム）への参加
  socket.on('join-frequency', (frequency) => {
    const roomID = `room_${frequency.replace('.', '')}`;
    
    Array.from(socket.rooms).forEach(room => {
      if (room !== socket.id) {
        socket.leave(room);
        updateRoomCount(room);
      }
    });

    socket.join(roomID);
    socket.currentRoom = roomID;
    socket.frequency = frequency; // 周波数を記憶
    updateRoomCount(roomID);
  });

  // ⚠️【管理者機能】周波数内の全員に遠隔指令を飛ばす
  socket.on('admin-command', ({ action, freq }) => {
    const roomID = `room_${freq.replace('.', '')}`;
    console.log(`[ADMIN COMMAND] 行動: ${action} / 対象周波数: ${freq}`);

    if (action === 'KICK') {
      // その周波数にいる全員を強制切断（スタンドバイに戻す）
      io.to(roomID).emit('admin-force-disconnect');
    } else if (action === 'MUTE') {
      // その周波数にいる全員のマイクを強制消音
      io.to(roomID).emit('admin-force-mute');
    } else if (action === 'BLOCK') {
      // 現在その部屋にいる全クライアントの通信を拒否リストへ（擬似BAN）
      const room = io.sockets.adapter.rooms.get(roomID);
      if (room) {
        for (const clientId of room) {
          const clientSocket = io.sockets.sockets.get(clientId);
          if (clientSocket) {
            bannedUsers.add(clientSocket.handshake.address);
            clientSocket.disconnect(true);
          }
        }
      }
    }
  });

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