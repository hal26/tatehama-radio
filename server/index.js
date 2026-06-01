const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = 3000;
const bannedUsers = new Set();

// 接続中ユーザーのリアルタイム位置情報データベース
const activeUsers = {};

io.on('connection', (socket) => {
  if (bannedUsers.has(socket.handshake.address) || bannedUsers.has(socket.id)) {
    socket.disconnect(true);
    return;
  }

  console.log(`接続: ${socket.id}`);

  // 乗務開始（ログイン）情報を受け取る
  socket.on('user-login', ({ name, role }) => {
    activeUsers[socket.id] = {
      id: socket.id,
      name: name || '名無し乗務員',
      role: role, // driver, signal, dispatcher
      location: '未接続'
    };
    // 司令画面の更新のために全員へアナウンス
    sendDispatcherUpdate();
  });

  // 周波数または信号VCへの接続
  socket.on('join-frequency', ({ frequency, displayLabel }) => {
    const roomID = `room_${frequency.replace('.', '')}`;
    const room = io.sockets.adapter.rooms.get(roomID);

    // 💥 【人数制限】5名以上の場合は接続拒否
    if (room && room.size >= 5) {
      socket.emit('join-failed', '定員（5名）に達しているため、このVCには入れません。');
      return;
    }

    // 既存の部屋を抜ける
    Array.from(socket.rooms).forEach(r => {
      if (r !== socket.id) {
        socket.leave(r);
        updateRoomCount(r);
      }
    });

    socket.join(roomID);
    socket.currentRoom = roomID;
    socket.frequency = frequency;

    // ユーザーの位置情報を更新
    if (activeUsers[socket.id]) {
      activeUsers[socket.id].location = displayLabel;
    }

    socket.emit('join-success', { frequency, displayLabel });
    updateRoomCount(roomID);
    sendDispatcherUpdate();
  });

  // ⚠️【管理者（司令）指令機能】
  socket.on('admin-command', ({ action, freq }) => {
    const roomID = `room_${freq.replace('.', '')}`;
    if (action === 'KICK') {
      io.to(roomID).emit('admin-force-disconnect');
    } else if (action === 'MUTE') {
      io.to(roomID).emit('admin-force-mute');
    } else if (action === 'BLOCK') {
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

  // 切断処理（回線切断ボタン）
  socket.on('leave-frequency', () => {
    if (socket.currentRoom) {
      const oldRoom = socket.currentRoom;
      socket.leave(oldRoom);
      socket.currentRoom = null;
      if (activeUsers[socket.id]) {
        activeUsers[socket.id].location = '未接続';
      }
      updateRoomCount(oldRoom);
      sendDispatcherUpdate();
    }
  });

  socket.on('disconnect', () => {
    delete activeUsers[socket.id];
    if (socket.currentRoom) {
      updateRoomCount(socket.currentRoom);
    }
    sendDispatcherUpdate();
  });
});

function updateRoomCount(roomID) {
  const room = io.sockets.adapter.rooms.get(roomID);
  const count = room ? room.size : 0;
  io.to(roomID).emit('room-count-update', count);
}

// 司令用の一覧データを全クライアント（特に司令）に同期
function sendDispatcherUpdate() {
  io.emit('dispatcher-monitor-data', Object.values(activeUsers));
}

server.listen(PORT, () => {
  console.log(`鉄道無線サーバー起動 ポート: ${PORT}`);
});